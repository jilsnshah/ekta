from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from .. import schemas, serializers
from ..database import get_db
from ..pagination import Page, PageParams, as_page, paginate
from ..models import (
    Driver,
    DriverStatus,
    LOAD_BEARING_ORDER_STATUSES,
    OPERATOR_SETTABLE_TRUCK_STATUSES,
    OrderStatus,
    TransportOrder,
    Trip,
    TripStatus,
    Truck,
    TruckStatus,
)
from ..security import current_user, require_admin
from ..services import capacity
from ..services.realtime import hub

router = APIRouter(prefix="/api/trucks", tags=["trucks"])

ACTIVE_TRIP_STATUSES = [
    TripStatus.PLANNED.value,
    TripStatus.DISPATCHED.value,
    TripStatus.IN_PROGRESS.value,
]

IN_TRANSIT_STATUSES = [
    TruckStatus.IN_TRANSIT.value,
    TruckStatus.AT_PICKUP.value,
    TruckStatus.AT_DELIVERY.value,
]


def _get_truck(db: Session, truck_id: int) -> Truck:
    truck = db.get(Truck, truck_id)
    if truck is None:
        raise HTTPException(status_code=404, detail="Truck not found")
    return truck


LOAD_BEARING_VALUES = [s.value for s in LOAD_BEARING_ORDER_STATUSES]

TRUCK_SORTS = {
    "registration_number": Truck.registration_number,
    "capacity_tons": Truck.capacity_tons,
    "status": Truck.status,
    "base_city": Truck.base_city,
}


def _load_on_board():
    """Correlated SUM of the weight currently assigned to each truck.

    Expressed in SQL rather than Python because the capacity filters below
    have to apply before a page is taken -- filtering a page after the fact
    would drop rows that belong on it.
    """
    return (
        select(func.coalesce(func.sum(TransportOrder.quantity_tons), 0.0))
        .where(TransportOrder.truck_id == Truck.id)
        .where(TransportOrder.status.in_(LOAD_BEARING_VALUES))
        .correlate(Truck)
        .scalar_subquery()
    )


@router.get("", response_model=Page[schemas.TruckOut])
def list_trucks(
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    page: PageParams = Depends(),
    status: Optional[List[str]] = Query(default=None),
    driver_id: Optional[int] = None,
    base_city: Optional[str] = None,
    min_capacity: Optional[float] = None,
    max_capacity: Optional[float] = None,
    has_available_capacity: bool = False,
    in_transit: bool = False,
    with_pending_orders: bool = False,
    without_driver: bool = False,
    search: Optional[str] = None,
    sort: str = Query("registration_number"),
    descending: bool = False,
):
    """Fleet listing. Every filter is applied in SQL, before the page."""
    column = TRUCK_SORTS.get(sort, Truck.registration_number)
    stmt = select(Truck).order_by(
        column.desc() if descending else column.asc(), Truck.id
    )

    if status:
        stmt = stmt.where(Truck.status.in_(status))
    if driver_id is not None:
        stmt = stmt.where(Truck.driver_id == driver_id)
    if base_city:
        stmt = stmt.where(Truck.base_city.ilike(f"%{base_city}%"))
    if min_capacity is not None:
        stmt = stmt.where(Truck.capacity_tons >= min_capacity)
    if max_capacity is not None:
        stmt = stmt.where(Truck.capacity_tons <= max_capacity)
    if without_driver:
        stmt = stmt.where(Truck.driver_id.is_(None))
    if in_transit:
        stmt = stmt.where(Truck.status.in_(IN_TRANSIT_STATUSES))
    if has_available_capacity:
        stmt = stmt.where(_load_on_board() < Truck.capacity_tons)
    if with_pending_orders:
        stmt = stmt.where(
            select(TransportOrder.id)
            .where(TransportOrder.truck_id == Truck.id)
            .where(
                TransportOrder.status.in_(
                    [OrderStatus.ASSIGNED.value, OrderStatus.PICKUP_PENDING.value]
                )
            )
            .correlate(Truck)
            .exists()
        )
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.outerjoin(Driver, Truck.driver_id == Driver.id).where(
            or_(
                Truck.registration_number.ilike(term),
                Driver.name.ilike(term),
                Driver.phone.ilike(term),
                Truck.base_city.ilike(term),
            )
        )

    stmt = stmt.options(selectinload(Truck.driver))
    rows, total = paginate(db, stmt, page)

    # Prefetch for the whole page: on its own truck_out fetches each truck's
    # load-bearing orders and current trip, which is three queries a row.
    truck_ids = [t.id for t in rows]
    orders_by_truck: dict = {tid: [] for tid in truck_ids}
    if truck_ids:
        for order in db.scalars(
            select(TransportOrder)
            .where(TransportOrder.truck_id.in_(truck_ids))
            .where(TransportOrder.status.in_(LOAD_BEARING_VALUES))
            .order_by(TransportOrder.pickup_date)
        ):
            orders_by_truck.setdefault(order.truck_id, []).append(order)

    trip_ids = [t.current_trip_id for t in rows if t.current_trip_id]
    trips_by_id: dict = {}
    if trip_ids:
        trips_by_id = {
            trip.id: trip
            for trip in db.scalars(
                select(Trip).where(Trip.id.in_(trip_ids)).options(selectinload(Trip.stops))
            )
        }

    return as_page(
        [
            serializers.truck_out(
                db,
                t,
                orders=orders_by_truck.get(t.id, []),
                trip=trips_by_id.get(t.current_trip_id) if t.current_trip_id else None,
            )
            for t in rows
        ],
        total,
        page,
    )


@router.get("/{truck_id}", response_model=schemas.TruckOut)
def get_truck(truck_id: int, db: Session = Depends(get_db), _user=Depends(current_user)):
    return serializers.truck_out(db, _get_truck(db, truck_id))


@router.post("", response_model=schemas.TruckOut, status_code=201)
def create_truck(
    payload: schemas.TruckCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    reg = payload.registration_number.strip().upper()
    if db.scalar(select(Truck).where(Truck.registration_number == reg)):
        raise HTTPException(
            status_code=409, detail=f"Truck {reg} already exists in the fleet"
        )

    data = payload.model_dump()
    data["registration_number"] = reg
    driver_id = data.pop("driver_id", None)
    truck = Truck(**data)

    if driver_id is not None:
        _attach_driver(db, truck, driver_id)

    db.add(truck)
    db.commit()
    db.refresh(truck)
    return serializers.truck_out(db, truck)


@router.patch("/{truck_id}", response_model=schemas.TruckOut)
def update_truck(
    truck_id: int,
    payload: schemas.TruckUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    truck = _get_truck(db, truck_id)
    data = payload.model_dump(exclude_unset=True)

    if data.get("registration_number"):
        reg = data["registration_number"].strip().upper()
        clash = db.scalar(
            select(Truck)
            .where(Truck.registration_number == reg)
            .where(Truck.id != truck.id)
        )
        if clash:
            raise HTTPException(status_code=409, detail=f"Truck {reg} already exists")
        data["registration_number"] = reg

    if data.get("capacity_tons") is not None:
        snap = capacity.snapshot(db, truck)
        if data["capacity_tons"] < snap.current_load_tons - 1e-6:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Cannot reduce capacity to {data['capacity_tons']}T: the truck is "
                    f"already carrying {snap.current_load_tons}T. Unassign orders first."
                ),
            )

    if data.get("status") and data["status"] not in [s.value for s in TruckStatus]:
        raise HTTPException(status_code=422, detail="Unknown truck status")

    if "driver_id" in data:
        _attach_driver(db, truck, data.pop("driver_id"))

    for key, value in data.items():
        setattr(truck, key, value)

    db.commit()
    db.refresh(truck)
    return serializers.truck_out(db, truck)


def _attach_driver(db: Session, truck: Truck, driver_id: Optional[int]) -> None:
    """Enforce the one-driver-one-truck rule."""
    if driver_id is None:
        truck.driver_id = None
        return

    driver = db.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    other = db.scalar(
        select(Truck)
        .where(Truck.driver_id == driver_id)
        .where(Truck.id != (truck.id or -1))
    )
    if other is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{driver.name} is already assigned to {other.registration_number}. "
                f"A driver cannot be on two trucks at once."
            ),
        )
    truck.driver_id = driver_id


@router.delete("/{truck_id}", status_code=204)
def delete_truck(
    truck_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)
):
    truck = _get_truck(db, truck_id)
    active = db.scalar(
        select(Trip)
        .where(Trip.truck_id == truck.id)
        .where(Trip.status.in_(ACTIVE_TRIP_STATUSES))
    )
    if active is not None:
        raise HTTPException(
            status_code=409,
            detail=f"{truck.registration_number} is on active trip {active.code}",
        )
    db.delete(truck)
    db.commit()


@router.get("/{truck_id}/trips", response_model=Page[schemas.TripBrief])
def truck_trips(
    truck_id: int,
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    page: PageParams = Depends(),
):
    _get_truck(db, truck_id)
    stmt = (
        select(Trip)
        .where(Trip.truck_id == truck_id)
        .order_by(Trip.created_at.desc(), Trip.id.desc())
    )
    rows, total = paginate(db, stmt, page)
    return as_page([serializers.trip_brief(t) for t in rows], total, page)


@router.get("/{truck_id}/capacity", response_model=schemas.CapacityOut)
def truck_capacity(
    truck_id: int, db: Session = Depends(get_db), _user=Depends(current_user)
):
    snap = capacity.snapshot(db, _get_truck(db, truck_id))
    return schemas.CapacityOut(
        capacity_tons=snap.capacity_tons,
        current_load_tons=snap.current_load_tons,
        available_tons=snap.available_tons,
        utilisation_percent=snap.utilisation_percent,
        order_count=snap.order_count,
    )


@router.post("/{truck_id}/status", response_model=schemas.TruckOut)
async def set_status(
    truck_id: int,
    new_status: str = Query(..., alias="status"),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Operator-set status. In-transit and assigned are driven by the trip."""
    truck = _get_truck(db, truck_id)
    allowed = [s.value for s in OPERATOR_SETTABLE_TRUCK_STATUSES]
    if new_status not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Status must be one of: {', '.join(allowed)}",
        )
    if (
        new_status == TruckStatus.AVAILABLE.value
        and truck.current_trip_id is not None
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "This truck is on an active trip. Complete or cancel the trip to "
                "make it available."
            ),
        )

    truck.status = new_status
    if truck.driver is not None:
        if new_status == TruckStatus.MAINTENANCE.value:
            truck.driver.status = DriverStatus.RESTING.value
        elif new_status == TruckStatus.AVAILABLE.value:
            truck.driver.status = DriverStatus.AVAILABLE.value
    db.commit()
    db.refresh(truck)

    out = serializers.truck_out(db, truck)
    await hub.broadcast("truck_status", {"truck_id": truck.id, "status": truck.status})
    return out
