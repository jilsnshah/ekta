"""The driver app.

A driver signs in with the number on their fleet record, sees the trip their
truck is on, and closes each stop as they complete it. Those updates are what
the control room and the billing party both read, so this is the source of
truth for trip progress.

Every endpoint is scoped to the signed-in driver's own trip.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas
from ..clock import utcnow
from ..config import get_settings
from ..database import get_db
from ..pagination import Page, PageParams, as_page, paginate
from ..driver_security import current_driver, find_driver_by_phone
from ..models import (
    Alert,
    AlertKind,
    AlertSeverity,
    Driver,
    StopStatus,
    Trip,
    TripStatus,
    TruckStatus,
)
from ..portal_security import display_phone, normalise_phone, verify_otp
from ..services import driver_app as driver_service
from ..services import trips as trip_service
from ..services.realtime import hub

router = APIRouter(prefix="/api/driver", tags=["driver app"])


# --------------------------------------------------------------------------- #
# Authentication
# --------------------------------------------------------------------------- #
@router.post("/auth/request-otp", response_model=schemas.OtpRequestResult)
def request_otp(payload: schemas.OtpRequest, db: Session = Depends(get_db)):
    """Begin a sign-in.

    A driver account is created by the control room, never here, so an unknown
    number is refused outright rather than silently creating one.
    """
    try:
        phone = normalise_phone(payload.phone)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    fixed = (get_settings().portal_otp_fixed or "").strip()
    if not fixed:
        raise HTTPException(
            status_code=503, detail="OTP delivery is not configured on this server"
        )

    if find_driver_by_phone(db, phone) is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "This number is not on the fleet's driver list. Ask the control "
                "room to add it."
            ),
        )

    return schemas.OtpRequestResult(
        phone=display_phone(phone),
        sent=True,
        development_hint=f"Development build: use {fixed}",
    )


@router.post("/auth/verify", response_model=schemas.DriverSession)
def verify(payload: schemas.DriverOtpVerify, db: Session = Depends(get_db)):
    try:
        phone = normalise_phone(payload.phone)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if not verify_otp(payload.otp):
        raise HTTPException(status_code=401, detail="That code is not correct")

    driver = find_driver_by_phone(db, phone)
    if driver is None:
        raise HTTPException(
            status_code=404, detail="This number is not on the fleet's driver list"
        )

    driver.last_login_at = utcnow()
    db.commit()
    db.refresh(driver)
    return driver_service.session_for(db, driver)


@router.get("/me", response_model=schemas.DriverSession)
def me(db: Session = Depends(get_db), driver: Driver = Depends(current_driver)):
    return driver_service.session_for(db, driver)


# --------------------------------------------------------------------------- #
# The current trip
# --------------------------------------------------------------------------- #
@router.get("/trip/current", response_model=schemas.DriverTripOut | None)
def current_trip(
    db: Session = Depends(get_db), driver: Driver = Depends(current_driver)
):
    """The trip the driver's truck is on, or null when there is nothing to do."""
    trip = driver_service.active_trip(db, driver)
    return driver_service.trip_out(trip) if trip is not None else None


def _require_trip(db: Session, driver: Driver, trip_id: int):
    trip = driver_service.owned_trip(db, driver, trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@router.get("/trips/stats", response_model=schemas.DriverTripStats)
def trip_stats(
    db: Session = Depends(get_db),
    driver: Driver = Depends(current_driver),
):
    """The driver's own record: trips finished and tonnage carried.

    Counted in SQL over every trip they have run, so the figure does not shrink
    to whatever page of history happens to be on screen.
    """
    row = db.execute(
        select(
            func.count(Trip.id),
            func.coalesce(func.sum(Trip.total_cargo_tons), 0.0),
        )
        .where(Trip.driver_id == driver.id)
        .where(Trip.status == TripStatus.COMPLETED.value)
    ).one()
    total = int(db.scalar(select(func.count(Trip.id)).where(Trip.driver_id == driver.id)) or 0)
    return schemas.DriverTripStats(
        total=total,
        completed=int(row[0]),
        completed_cargo_tons=round(float(row[1]), 2),
    )


@router.get("/trips/{trip_id}", response_model=schemas.DriverTripOut)
def get_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    driver: Driver = Depends(current_driver),
):
    return driver_service.trip_out(_require_trip(db, driver, trip_id))


@router.get("/trips", response_model=Page[schemas.DriverTripBrief])
def trip_history(
    db: Session = Depends(get_db),
    driver: Driver = Depends(current_driver),
    page: PageParams = Depends(),
):
    stmt = (
        select(Trip)
        .where(Trip.driver_id == driver.id)
        .order_by(Trip.created_at.desc(), Trip.id.desc())
    )
    rows, total = paginate(db, stmt, page)
    return as_page([driver_service.trip_brief(t) for t in rows], total, page)


@router.post("/trips/{trip_id}/start", response_model=schemas.DriverTripOut)
async def start_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    driver: Driver = Depends(current_driver),
):
    """Driver confirms they are rolling."""
    trip = _require_trip(db, driver, trip_id)
    if trip.status == TripStatus.IN_PROGRESS.value:
        return driver_service.trip_out(trip)
    try:
        trip_service.start_trip(db, trip)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc)})

    out = driver_service.trip_out(trip)
    await hub.broadcast(
        "trip_started",
        {
            "trip_id": trip.id,
            "code": trip.code,
            "truck_id": trip.truck_id,
            "by": "driver",
        },
    )
    return out


@router.post("/trips/{trip_id}/stops/{stop_id}/complete", response_model=schemas.DriverTripOut)
async def complete_stop(
    trip_id: int,
    stop_id: int,
    db: Session = Depends(get_db),
    driver: Driver = Depends(current_driver),
):
    """Close a stop. This is what moves the order on for everybody else."""
    trip = _require_trip(db, driver, trip_id)

    stop = next((s for s in trip.stops if s.id == stop_id), None)
    if stop is None:
        raise HTTPException(status_code=404, detail="Stop not found on this trip")
    if stop.status == StopStatus.COMPLETED.value:
        # Idempotent: a double tap on a slow connection is not an error.
        return driver_service.trip_out(trip)
    if trip.status != TripStatus.IN_PROGRESS.value:
        raise HTTPException(
            status_code=422,
            detail={"message": "Start the trip before closing stops."},
        )

    blocker = trip_service.stop_blocked_by(trip, stop)
    if blocker is not None:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    f"Close stop {blocker.sequence + 1} ({blocker.place_name}) first."
                )
            },
        )

    trip_service.complete_stop(db, trip, stop)
    out = driver_service.trip_out(trip)

    await hub.broadcast(
        "stop_completed",
        {
            "trip_id": trip.id,
            "stop_id": stop.id,
            "progress_percent": trip.progress_percent,
            "trip_status": trip.status,
            "truck_id": trip.truck_id,
            "by": "driver",
        },
    )
    return out


@router.post("/trips/{trip_id}/report-delay", response_model=schemas.DriverTripOut)
async def report_delay(
    trip_id: int,
    payload: schemas.DriverDelayReport,
    db: Session = Depends(get_db),
    driver: Driver = Depends(current_driver),
):
    """Flag a hold-up. The driver knows before the control room does."""
    trip = _require_trip(db, driver, trip_id)
    truck = trip.truck
    truck.status = TruckStatus.DELAYED.value

    reason = payload.reason.strip()
    # One open report per driver per trip, so repeated taps do not pile up.
    key = f"driverdelay:{trip.id}:{driver.id}"
    existing = next((a for a in db.query(Alert).filter(Alert.dedupe_key == key)), None)
    if existing is None:
        db.add(
            Alert(
                kind=AlertKind.DRIVER_REPORTED_DELAY.value,
                severity=AlertSeverity.CRITICAL.value,
                title=f"Driver reported a delay - {truck.registration_number}",
                message=(
                    f"{driver.name} on {trip.code} reported: {reason}"
                ),
                dedupe_key=key,
                truck_id=truck.id,
                trip_id=trip.id,
                driver_id=driver.id,
                created_at=utcnow(),
            )
        )
    else:
        existing.message = f"{driver.name} on {trip.code} reported: {reason}"
        existing.acknowledged = False

    db.commit()
    db.refresh(trip)

    out = driver_service.trip_out(trip)
    await hub.broadcast(
        "driver_delay",
        {
            "trip_id": trip.id,
            "code": trip.code,
            "truck_id": truck.id,
            "driver": driver.name,
            "reason": reason,
        },
    )
    return out


@router.post("/trips/{trip_id}/clear-delay", response_model=schemas.DriverTripOut)
async def clear_delay(
    trip_id: int,
    db: Session = Depends(get_db),
    driver: Driver = Depends(current_driver),
):
    """Driver is moving again."""
    trip = _require_trip(db, driver, trip_id)
    truck = trip.truck
    if truck.status == TruckStatus.DELAYED.value:
        truck.status = (
            TruckStatus.IN_TRANSIT.value
            if trip.status == TripStatus.IN_PROGRESS.value
            else TruckStatus.ASSIGNED.value
        )

    for alert in db.query(Alert).filter(
        Alert.dedupe_key == f"driverdelay:{trip.id}:{driver.id}"
    ):
        alert.acknowledged = True

    db.commit()
    db.refresh(trip)

    out = driver_service.trip_out(trip)
    await hub.broadcast(
        "truck_status", {"truck_id": truck.id, "status": truck.status, "by": "driver"}
    )
    return out
