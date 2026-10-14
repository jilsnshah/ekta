"""Driver-shaped views of a trip.

A driver needs one thing at a time: where to go next, who to call there, and
what to load or hand over. Everything here is built around that, and scoped to
the signed-in driver's own trip.
"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..models import (
    Driver,
    StopStatus,
    StopType,
    Trip,
    TripStop,
    TruckStatus,
)
from . import trips as trip_service


def active_trip(db: Session, driver: Driver) -> Optional[Trip]:
    """The trip this driver should be working, if any.

    Resolved through the driver's own truck rather than ``Trip.driver_id``, so
    a trip that was reassigned to another truck stops appearing here.
    """
    truck = driver.truck
    if truck is None:
        return None
    return trip_service.active_trip_for_truck(db, truck.id)


def owned_trip(db: Session, driver: Driver, trip_id: int) -> Optional[Trip]:
    """One of *this* driver's trips, or None.

    Checked against the trip's truck and its recorded driver, so a trip id
    belonging to another driver simply reads as missing.
    """
    trip = db.get(Trip, trip_id)
    if trip is None:
        return None
    truck = driver.truck
    if truck is not None and trip.truck_id == truck.id:
        return trip
    if trip.driver_id == driver.id:
        return trip
    return None


def _stop_out(stop: TripStop, load_after: float) -> schemas.DriverStopOut:
    return schemas.DriverStopOut(
        id=stop.id,
        sequence=stop.sequence,
        stop_type=stop.stop_type,
        status=stop.status,
        place_name=stop.place_name,
        place_phone=stop.place_phone,
        place_address=stop.place_address,
        completed_at=stop.completed_at,
        orders=[
            schemas.DriverStopOrder(
                code=order.code,
                order_number=order.order_number,
                billing_party=order.billing_party,
                material=order.material,
                quantity_tons=order.quantity_tons,
            )
            for order in stop.orders
        ],
        load_after_tons=round(load_after, 3),
    )


def trip_out(trip: Trip) -> schemas.DriverTripOut:
    truck = trip.truck
    ordered = sorted(trip.stops, key=lambda s: s.sequence)

    # Running weight, so the driver can sanity-check the load at each stop.
    load = 0.0
    stops: List[schemas.DriverStopOut] = []
    for stop in ordered:
        delta = sum(o.quantity_tons for o in stop.orders)
        load += delta if stop.stop_type == StopType.PICKUP.value else -delta
        stops.append(_stop_out(stop, load))

    pending = [s for s in ordered if s.status != StopStatus.COMPLETED.value]
    next_index = ordered.index(pending[0]) if pending else None

    return schemas.DriverTripOut(
        id=trip.id,
        code=trip.code,
        status=trip.status,
        truck_registration=truck.registration_number,
        truck_capacity_tons=truck.capacity_tons,
        total_cargo_tons=trip.total_cargo_tons,
        progress_percent=trip.progress_percent,
        stops_completed=len(ordered) - len(pending),
        stop_count=len(ordered),
        started_at=trip.started_at,
        completed_at=trip.completed_at,
        next_stop=stops[next_index] if next_index is not None else None,
        stops=stops,
        is_delayed=truck.status == TruckStatus.DELAYED.value,
    )


def trip_brief(trip: Trip) -> schemas.DriverTripBrief:
    completed = len(
        [s for s in trip.stops if s.status == StopStatus.COMPLETED.value]
    )
    return schemas.DriverTripBrief(
        id=trip.id,
        code=trip.code,
        status=trip.status,
        total_cargo_tons=trip.total_cargo_tons,
        stop_count=len(trip.stops),
        stops_completed=completed,
        started_at=trip.started_at,
        completed_at=trip.completed_at,
    )


def history(db: Session, driver: Driver) -> List[Trip]:
    """Trips this driver has run, newest first."""
    return list(
        db.scalars(
            select(Trip)
            .where(Trip.driver_id == driver.id)
            .order_by(Trip.created_at.desc())
            .limit(100)
        )
    )


def session_for(db: Session, driver: Driver) -> schemas.DriverSession:
    from ..driver_security import create_driver_token

    truck = driver.truck
    return schemas.DriverSession(
        access_token=create_driver_token(driver),
        driver_id=driver.id,
        code=driver.code,
        name=driver.name,
        phone=driver.phone,
        truck_registration=truck.registration_number if truck else None,
        truck_capacity_tons=truck.capacity_tons if truck else None,
        has_active_trip=active_trip(db, driver) is not None,
    )
