"""Order-to-truck assignment: the system's central operation.

``POST /api/assignment/preview`` answers "can this truck take these orders?"
without mutating anything, which is what the drag-and-drop board calls.
``POST /api/assignment/assign`` performs the real thing under the same
validation, then builds or extends the trip.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..clock import utcnow
from ..database import get_db
from ..pagination import PageParams, as_page, paginate
from ..models import (
    Driver,
    LOAD_BEARING_ORDER_STATUSES,
    OPEN_ORDER_STATUSES,
    OrderStatus,
    TransportOrder,
    Trip,
    Truck,
    TruckStatus,
)
from ..security import require_admin
from ..services import capacity
from ..services import trips as trip_service
from ..services.realtime import hub
from ..services.sequencing import plan

router = APIRouter(prefix="/api/assignment", tags=["assignment"])

LOAD_BEARING_VALUES = [s.value for s in LOAD_BEARING_ORDER_STATUSES]


def _fetch(db: Session, truck_id: int, order_ids: List[int]):
    truck = db.get(Truck, truck_id)
    if truck is None:
        raise HTTPException(status_code=404, detail="Truck not found")

    orders = list(
        db.scalars(select(TransportOrder).where(TransportOrder.id.in_(order_ids)))
    )
    missing = set(order_ids) - {o.id for o in orders}
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown order id(s): {', '.join(str(i) for i in sorted(missing))}",
        )
    # Preserve the caller's order so planning is deterministic.
    by_id = {o.id: o for o in orders}
    return truck, [by_id[i] for i in order_ids]


@router.post("/preview", response_model=schemas.AssignPreviewOut)
def preview(
    payload: schemas.AssignPreviewRequest,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    truck, orders = _fetch(db, payload.truck_id, payload.order_ids)
    snap = capacity.snapshot(db, truck)
    incoming = [o for o in orders if o.truck_id != truck.id]
    requested = round(sum(o.quantity_tons for o in incoming), 3)
    load_after = round(snap.current_load_tons + requested, 3)
    allowed = load_after <= truck.capacity_tons + 1e-6

    reason = None
    try:
        capacity.assert_assignable(incoming)
    except ValueError as exc:
        allowed, reason = False, str(exc)

    if not allowed and reason is None:
        reason = (
            f"Over capacity by {round(load_after - truck.capacity_tons, 3)}T. "
            f"{truck.registration_number} holds {truck.capacity_tons}T and already "
            f"carries {snap.current_load_tons}T."
        )
    elif allowed and truck.driver_id is None:
        reason = (
            f"{truck.registration_number} has no driver assigned. Assign a driver "
            f"before dispatching a trip."
        )

    planned: List[schemas.PlannedStopOut] = []
    if allowed:
        combined = capacity.load_bearing_orders(db, truck.id) + incoming
        route = plan(combined, truck.capacity_tons)
        for index, stop in enumerate(route.stops):
            planned.append(
                schemas.PlannedStopOut(
                    sequence=index,
                    stop_type=stop.stop_type.value,
                    place_name=stop.place.name,
                    place_address=stop.place.address,
                    order_ids=stop.order_ids,
                )
            )

    return schemas.AssignPreviewOut(
        allowed=allowed,
        reason=reason,
        capacity_tons=snap.capacity_tons,
        current_load_tons=snap.current_load_tons,
        available_tons=snap.available_tons,
        requested_tons=requested,
        load_after_tons=load_after,
        utilisation_after_percent=(
            round(load_after / truck.capacity_tons * 100, 1)
            if truck.capacity_tons
            else 0.0
        ),
        overflow_tons=max(round(load_after - truck.capacity_tons, 3), 0.0),
        planned_stops=planned,
    )


@router.post("/assign", response_model=schemas.AssignResult)
async def assign(
    payload: schemas.AssignRequest,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    truck, orders = _fetch(db, payload.truck_id, payload.order_ids)

    try:
        capacity.assert_assignable(orders)
        capacity.validate_assignment(db, truck, orders)
    except capacity.CapacityError as exc:
        raise HTTPException(status_code=422, detail=exc.detail())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc)})

    trip = None
    if payload.create_trip:
        try:
            trip = trip_service.create_trip(db, truck, orders)
        except capacity.CapacityError as exc:
            raise HTTPException(status_code=422, detail=exc.detail())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail={"message": str(exc)})
    else:
        # Book the orders against the truck without opening a trip yet.
        for order in orders:
            order.truck_id = truck.id
            order.assigned_at = order.assigned_at or utcnow()
            if order.status in (OrderStatus.NEW.value, OrderStatus.UNASSIGNED.value):
                order.status = OrderStatus.ASSIGNED.value
        if truck.status == TruckStatus.AVAILABLE.value:
            truck.status = TruckStatus.ASSIGNED.value
        db.commit()

    db.refresh(truck)
    truck_payload = serializers.truck_out(db, truck)

    await hub.broadcast(
        "assignment",
        {
            "truck_id": truck.id,
            "registration_number": truck.registration_number,
            "order_ids": [o.id for o in orders],
            "trip_id": trip.id if trip else None,
            "trip_code": trip.code if trip else None,
            "current_load_tons": truck_payload.capacity.current_load_tons,
            "available_tons": truck_payload.capacity.available_tons,
        },
    )

    return schemas.AssignResult(
        truck=truck_payload,
        trip=serializers.trip_out(trip) if trip is not None else None,
        assigned_order_ids=[o.id for o in orders],
        capacity=truck_payload.capacity,
    )


@router.post("/unassign/{order_id}", response_model=schemas.AssignResult)
async def unassign(
    order_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)
):
    order = db.get(TransportOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Transport order not found")
    if order.truck_id is None:
        raise HTTPException(status_code=422, detail=f"{order.code} is not assigned")

    truck = order.truck
    trip = db.get(Trip, order.trip_id) if order.trip_id else None

    try:
        if trip is not None:
            trip_service.detach_order(db, trip, order)
        else:
            order.truck_id = None
            order.assigned_at = None
            order.status = OrderStatus.UNASSIGNED.value
            db.commit()
            db.refresh(truck)
            if not capacity.load_bearing_orders(db, truck.id):
                truck.status = TruckStatus.AVAILABLE.value
                db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc)})

    db.refresh(truck)
    truck_payload = serializers.truck_out(db, truck)
    refreshed_trip = db.get(Trip, trip.id) if trip is not None else None

    await hub.broadcast(
        "assignment",
        {
            "truck_id": truck.id,
            "registration_number": truck.registration_number,
            "order_ids": [order.id],
            "unassigned": True,
            "current_load_tons": truck_payload.capacity.current_load_tons,
            "available_tons": truck_payload.capacity.available_tons,
        },
    )

    return schemas.AssignResult(
        truck=truck_payload,
        trip=serializers.trip_out(refreshed_trip) if refreshed_trip else None,
        assigned_order_ids=[],
        capacity=truck_payload.capacity,
    )


@router.get("/board", response_model=schemas.AssignBoardOut)
def board(
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
    orders: PageParams = Depends(),
    order_search: Optional[str] = None,
    order_sort: str = Query(
        "pickup_date", pattern="^(pickup_date|quantity_tons|pickup_name)$"
    ),
    truck_search: Optional[str] = None,
    truck_page: int = Query(1, ge=1),
    truck_page_size: int = Query(24, ge=1, le=100),
):
    """Everything the assignment screen needs, both sides paged.

    The backlog and the fleet are each their own page: on a busy day either
    could be thousands of rows, and the board is useless if it has to load
    them all before drawing.
    """
    open_values = [s.value for s in OPEN_ORDER_STATUSES]

    # Heaviest first is the useful order for weight; everything else reads
    # better ascending.
    ORDER_COLUMNS = {
        "pickup_date": TransportOrder.pickup_date.asc(),
        "quantity_tons": TransportOrder.quantity_tons.desc(),
        "pickup_name": TransportOrder.pickup_name.asc(),
    }
    order_stmt = (
        select(TransportOrder)
        .where(TransportOrder.status.in_(open_values))
        .order_by(ORDER_COLUMNS[order_sort], TransportOrder.id)
    )
    if order_search:
        term = f"%{order_search.strip()}%"
        order_stmt = order_stmt.where(
            or_(
                TransportOrder.code.ilike(term),
                TransportOrder.order_number.ilike(term),
                TransportOrder.material.ilike(term),
                TransportOrder.billing_party.ilike(term),
                TransportOrder.pickup_name.ilike(term),
                TransportOrder.drop_name.ilike(term),
            )
        )
    order_rows, order_total = paginate(db, order_stmt, orders)

    # Trucks with room, computed in SQL so paging is correct.
    load_on_board = (
        select(func.coalesce(func.sum(TransportOrder.quantity_tons), 0.0))
        .where(TransportOrder.truck_id == Truck.id)
        .where(TransportOrder.status.in_(LOAD_BEARING_VALUES))
        .correlate(Truck)
        .scalar_subquery()
    )
    truck_stmt = (
        select(Truck)
        .where(
            Truck.status.in_(
                [
                    TruckStatus.AVAILABLE.value,
                    TruckStatus.ASSIGNED.value,
                    TruckStatus.AT_PICKUP.value,
                    TruckStatus.IN_TRANSIT.value,
                ]
            )
        )
        .where(load_on_board < Truck.capacity_tons)
        .order_by(Truck.registration_number)
    )
    if truck_search:
        term = f"%{truck_search.strip()}%"
        truck_stmt = truck_stmt.outerjoin(Driver, Truck.driver_id == Driver.id).where(
            or_(
                Truck.registration_number.ilike(term),
                Driver.name.ilike(term),
                Truck.base_city.ilike(term),
            )
        )

    truck_params = PageParams(page=truck_page, page_size=truck_page_size)
    truck_rows, truck_total = paginate(db, truck_stmt, truck_params)

    # Totals describe the whole backlog, not the page on screen.
    unassigned_tons = float(
        db.scalar(
            select(func.coalesce(func.sum(TransportOrder.quantity_tons), 0.0)).where(
                TransportOrder.status.in_(open_values)
            )
        )
        or 0.0
    )
    free_capacity = float(
        db.scalar(
            select(
                func.coalesce(
                    func.sum(Truck.capacity_tons - load_on_board), 0.0
                )
            ).where(load_on_board < Truck.capacity_tons)
        )
        or 0.0
    )

    return {
        "unassigned_orders": as_page(
            [serializers.order_out(o) for o in order_rows], order_total, orders
        ),
        "trucks": as_page(
            [serializers.truck_out(db, t) for t in truck_rows],
            truck_total,
            truck_params,
        ),
        "totals": {
            "unassigned_count": order_total,
            "unassigned_tons": round(unassigned_tons, 3),
            "available_capacity_tons": round(free_capacity, 3),
            "trucks_with_space": truck_total,
        },
    }
