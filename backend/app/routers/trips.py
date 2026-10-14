from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..database import get_db
from ..pagination import Page, PageParams, as_page, paginate
from ..models import (
    Driver,
    StopStatus,
    TransportOrder,
    Trip,
    TripStatus,
    TripStop,
    Truck,
)
from ..security import current_user, require_admin
from ..services import capacity
from ..services import trips as trip_service
from ..services.realtime import hub

router = APIRouter(prefix="/api/trips", tags=["trips"])

ACTIVE = list(trip_service.ACTIVE_TRIP_STATUSES)


def _get_trip(db: Session, trip_id: int) -> Trip:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


TRIP_SORTS = {
    "created_at": Trip.created_at,
    "code": Trip.code,
    "status": Trip.status,
    "total_cargo_tons": Trip.total_cargo_tons,
    "progress_percent": Trip.progress_percent,
}


@router.get("", response_model=Page[schemas.TripBrief])
def list_trips(
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    page: PageParams = Depends(),
    status: Optional[List[str]] = Query(default=None),
    truck_id: Optional[int] = None,
    driver_id: Optional[int] = None,
    active: bool = False,
    search: Optional[str] = None,
    sort: str = Query("created_at"),
    descending: bool = True,
):
    column = TRIP_SORTS.get(sort, Trip.created_at)
    stmt = select(Trip).order_by(
        column.desc() if descending else column.asc(), Trip.id.desc()
    )

    if status:
        stmt = stmt.where(Trip.status.in_(status))
    if active:
        stmt = stmt.where(Trip.status.in_(ACTIVE))
    if truck_id is not None:
        stmt = stmt.where(Trip.truck_id == truck_id)
    if driver_id is not None:
        stmt = stmt.where(Trip.driver_id == driver_id)
    if search:
        term = f"%{search.strip()}%"
        stmt = (
            stmt.join(Truck, Trip.truck_id == Truck.id)
            .outerjoin(Driver, Trip.driver_id == Driver.id)
            .where(
                or_(
                    Trip.code.ilike(term),
                    Truck.registration_number.ilike(term),
                    Driver.name.ilike(term),
                )
            )
        )

    rows, total = paginate(db, stmt, page)
    return as_page([serializers.trip_brief(t) for t in rows], total, page)


@router.get("/stats", response_model=schemas.TripStats)
def trip_stats(
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    search: Optional[str] = None,
):
    """Trip counts per status, plus the tonnage currently on the road.

    Grouped in SQL. The status filter is deliberately not applied: these
    numbers label the status chips, which must show what selecting them would
    find rather than what is already selected.
    """
    stmt = select(Trip.status, func.count(Trip.id)).group_by(Trip.status)
    cargo = select(func.coalesce(func.sum(Trip.total_cargo_tons), 0.0)).where(
        Trip.status == TripStatus.IN_PROGRESS
    )

    if search:
        term = f"%{search.strip()}%"
        condition = or_(
            Trip.code.ilike(term),
            Truck.registration_number.ilike(term),
            Driver.name.ilike(term),
        )
        stmt = (
            stmt.join(Truck, Trip.truck_id == Truck.id)
            .outerjoin(Driver, Trip.driver_id == Driver.id)
            .where(condition)
        )
        cargo = (
            cargo.join(Truck, Trip.truck_id == Truck.id)
            .outerjoin(Driver, Trip.driver_id == Driver.id)
            .where(condition)
        )

    by_status = {status.value: 0 for status in TripStatus}
    for status, count in db.execute(stmt).all():
        key = status.value if hasattr(status, "value") else str(status)
        by_status[key] = int(count)

    return schemas.TripStats(
        total=sum(by_status.values()),
        by_status=by_status,
        active_cargo_tons=round(float(db.scalar(cargo) or 0.0), 2),
    )


@router.get("/{trip_id}", response_model=schemas.TripOut)
def get_trip(trip_id: int, db: Session = Depends(get_db), _user=Depends(current_user)):
    return serializers.trip_out(_get_trip(db, trip_id))


@router.post("", response_model=schemas.TripOut, status_code=201)
def create_trip(
    payload: schemas.TripCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    truck = db.get(Truck, payload.truck_id)
    if truck is None:
        raise HTTPException(status_code=404, detail="Truck not found")
    orders = list(
        db.scalars(
            select(TransportOrder).where(TransportOrder.id.in_(payload.order_ids))
        )
    )
    if len(orders) != len(payload.order_ids):
        raise HTTPException(status_code=404, detail="One or more orders not found")

    try:
        trip = trip_service.create_trip(db, truck, orders)
    except capacity.CapacityError as exc:
        raise HTTPException(status_code=422, detail=exc.detail())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc)})
    return serializers.trip_out(trip)


@router.post("/{trip_id}/replan", response_model=schemas.TripOut)
def replan(trip_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Rebuild the pending stop order from the orders' dates."""
    trip = _get_trip(db, trip_id)
    if trip.status in (TripStatus.COMPLETED.value, TripStatus.CANCELLED.value):
        raise HTTPException(
            status_code=422, detail=f"{trip.code} is {trip.status}; nothing to replan"
        )
    trip_service.replan(db, trip)
    db.commit()
    db.refresh(trip)
    return serializers.trip_out(trip)


@router.post("/{trip_id}/reorder", response_model=schemas.TripOut)
def reorder(
    trip_id: int,
    payload: schemas.ReorderRequest,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Apply a manual stop order. Precedence and capacity are re-validated."""
    trip = _get_trip(db, trip_id)
    try:
        trip_service.reorder_stops(db, trip, [s.model_dump() for s in payload.stops])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc)})
    return serializers.trip_out(trip)


@router.post("/{trip_id}/start", response_model=schemas.TripOut)
async def start(
    trip_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)
):
    trip = _get_trip(db, trip_id)
    try:
        trip_service.start_trip(db, trip)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc)})
    out = serializers.trip_out(trip)
    await hub.broadcast(
        "trip_started",
        {"trip_id": trip.id, "code": trip.code, "truck_id": trip.truck_id},
    )
    return out


@router.post("/{trip_id}/stops/{stop_id}/complete", response_model=schemas.TripOut)
async def complete_stop(
    trip_id: int,
    stop_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    trip = _get_trip(db, trip_id)
    stop = db.get(TripStop, stop_id)
    if stop is None or stop.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="Stop not found on this trip")
    if stop.status == StopStatus.COMPLETED.value:
        raise HTTPException(status_code=422, detail="Stop is already completed")
    if trip.status != TripStatus.IN_PROGRESS.value:
        raise HTTPException(
            status_code=422,
            detail={"message": f"{trip.code} is not in progress. Start the trip first."},
        )

    blocker = trip_service.stop_blocked_by(trip, stop)
    if blocker is not None:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Stop {blocker.sequence + 1} ({blocker.place_name}) must be "
                f"completed first"
            ),
        )

    trip_service.complete_stop(db, trip, stop)
    out = serializers.trip_out(trip)
    await hub.broadcast(
        "stop_completed",
        {
            "trip_id": trip.id,
            "stop_id": stop.id,
            "progress_percent": trip.progress_percent,
            "trip_status": trip.status,
            "truck_id": trip.truck_id,
        },
    )
    return out


@router.post("/{trip_id}/complete", response_model=schemas.TripOut)
async def complete(
    trip_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)
):
    trip = _get_trip(db, trip_id)
    if trip.status == TripStatus.COMPLETED.value:
        raise HTTPException(status_code=422, detail="Trip is already completed")
    for stop in trip.stops:
        stop.status = StopStatus.COMPLETED.value
    trip_service.finish_trip(db, trip)
    db.commit()
    db.refresh(trip)
    out = serializers.trip_out(trip)
    await hub.broadcast("trip_completed", {"trip_id": trip.id, "code": trip.code})
    return out


@router.post("/{trip_id}/cancel", response_model=schemas.TripOut)
async def cancel(
    trip_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)
):
    trip = _get_trip(db, trip_id)
    if trip.status == TripStatus.COMPLETED.value:
        raise HTTPException(
            status_code=422, detail="Completed trips cannot be cancelled"
        )
    trip_service.cancel_trip(db, trip)
    out = serializers.trip_out(trip)
    await hub.broadcast("trip_cancelled", {"trip_id": trip.id, "code": trip.code})
    return out
