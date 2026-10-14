"""ORM -> response-schema mapping.

Kept in one place so every endpoint returns identically shaped objects and
the frontend can rely on a single set of types.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import schemas
from .models import (
    Alert,
    Driver,
    StopStatus,
    TransportOrder,
    Trip,
    TripStatus,
    TripStop,
    Truck,
)
from .portal_security import display_phone
from .services import capacity, trips as trip_service


def order_brief(order: TransportOrder) -> schemas.OrderBrief:
    return schemas.OrderBrief(
        id=order.id,
        code=order.code,
        order_number=order.order_number,
        billing_party=order.billing_party,
        source=order.source,
        material=order.material,
        quantity_tons=order.quantity_tons,
        status=order.status,
        pickup_name=order.pickup_name,
        drop_name=order.drop_name,
        pickup_date=order.pickup_date,
    )


def order_out(order: TransportOrder) -> schemas.OrderOut:
    return schemas.OrderOut(
        **order_brief(order).model_dump(),
        placed_by_phone=(
            display_phone(order.placed_by.phone) if order.placed_by else None
        ),
        company_id=order.company_id,
        pickup_phone=order.pickup_phone,
        pickup_address=order.pickup_address,
        drop_phone=order.drop_phone,
        drop_address=order.drop_address,
        special_instructions=order.special_instructions,
        truck_id=order.truck_id,
        truck_registration=order.truck.registration_number if order.truck else None,
        trip_id=order.trip_id,
        trip_code=order.trip.code if order.trip else None,
        assigned_at=order.assigned_at,
        picked_up_at=order.picked_up_at,
        delivered_at=order.delivered_at,
        created_at=order.created_at,
    )


def driver_brief(driver: Driver) -> schemas.DriverBrief:
    return schemas.DriverBrief.model_validate(driver)


def driver_out(db: Session, driver: Driver) -> schemas.DriverOut:
    truck = driver.truck
    active = trip_service.active_trip_for_truck(db, truck.id) if truck else None
    completed = (
        db.scalar(
            select(func.count(Trip.id))
            .where(Trip.driver_id == driver.id)
            .where(Trip.status == TripStatus.COMPLETED.value)
        )
        or 0
    )
    return schemas.DriverOut(
        id=driver.id,
        code=driver.code,
        name=driver.name,
        phone=driver.phone,
        status=driver.status,
        license_number=driver.license_number,
        license_expiry=driver.license_expiry,
        home_city=driver.home_city,
        truck_id=truck.id if truck else None,
        truck_registration=truck.registration_number if truck else None,
        current_trip_id=active.id if active else None,
        current_trip_code=active.code if active else None,
        completed_trips=completed,
    )


def truck_out(db: Session, truck: Truck) -> schemas.TruckOut:
    snap = capacity.snapshot(db, truck)
    orders = capacity.load_bearing_orders(db, truck.id)
    trip = db.get(Trip, truck.current_trip_id) if truck.current_trip_id else None
    nxt: Optional[TripStop] = trip_service.next_stop(trip) if trip else None
    pending = (
        [s for s in trip.stops if s.status != StopStatus.COMPLETED.value] if trip else []
    )

    return schemas.TruckOut(
        id=truck.id,
        registration_number=truck.registration_number,
        capacity_tons=truck.capacity_tons,
        status=truck.status,
        base_city=truck.base_city,
        driver=driver_brief(truck.driver) if truck.driver else None,
        capacity=schemas.CapacityOut(
            capacity_tons=snap.capacity_tons,
            current_load_tons=snap.current_load_tons,
            available_tons=snap.available_tons,
            utilisation_percent=snap.utilisation_percent,
            order_count=snap.order_count,
        ),
        current_trip_id=trip.id if trip else None,
        current_trip_code=trip.code if trip else None,
        trip_status=trip.status if trip else None,
        trip_progress_percent=trip.progress_percent if trip else None,
        next_stop=nxt.place_name if nxt else None,
        next_stop_type=nxt.stop_type if nxt else None,
        stops_remaining=len(pending) if trip else None,
        final_drop=pending[-1].place_name if pending else None,
        orders=[order_brief(o) for o in orders],
        make=truck.make,
        model=truck.model,
        year=truck.year,
        axles=truck.axles,
        body_type=truck.body_type,
        fuel_type=truck.fuel_type,
        odometer_km=truck.odometer_km,
        insurance_expiry=truck.insurance_expiry,
        fitness_expiry=truck.fitness_expiry,
        notes=truck.notes,
    )


def truck_brief(truck: Truck) -> schemas.TruckBrief:
    return schemas.TruckBrief.model_validate(truck)


def trip_stop_out(stop: TripStop) -> schemas.TripStopOut:
    return schemas.TripStopOut(
        id=stop.id,
        sequence=stop.sequence,
        stop_type=stop.stop_type,
        status=stop.status,
        completed_at=stop.completed_at,
        place_name=stop.place_name,
        place_phone=stop.place_phone,
        place_address=stop.place_address,
        orders=[order_brief(o) for o in stop.orders],
    )


def trip_brief(trip: Trip) -> schemas.TripBrief:
    return schemas.TripBrief(
        id=trip.id,
        code=trip.code,
        status=trip.status,
        total_cargo_tons=trip.total_cargo_tons,
        progress_percent=trip.progress_percent,
        started_at=trip.started_at,
        completed_at=trip.completed_at,
        truck_id=trip.truck_id,
        truck_registration=trip.truck.registration_number if trip.truck else None,
        truck_capacity_tons=trip.truck.capacity_tons if trip.truck else None,
        driver_name=trip.driver.name if trip.driver else None,
        driver_phone=trip.driver.phone if trip.driver else None,
        order_count=len(trip.orders),
        stop_count=len(trip.stops),
        stops_completed=len(
            [s for s in trip.stops if s.status == StopStatus.COMPLETED.value]
        ),
    )


def trip_out(trip: Trip) -> schemas.TripOut:
    nxt = trip_service.next_stop(trip)
    return schemas.TripOut(
        **trip_brief(trip).model_dump(),
        truck=truck_brief(trip.truck) if trip.truck else None,
        driver=driver_brief(trip.driver) if trip.driver else None,
        orders=[order_brief(o) for o in trip.orders],
        stops=[trip_stop_out(s) for s in trip.stops],
        next_stop=trip_stop_out(nxt) if nxt else None,
    )


def alert_out(alert: Alert) -> schemas.AlertOut:
    return schemas.AlertOut(
        id=alert.id,
        kind=alert.kind,
        severity=alert.severity,
        title=alert.title,
        message=alert.message,
        truck_id=alert.truck_id,
        order_id=alert.order_id,
        trip_id=alert.trip_id,
        driver_id=alert.driver_id,
        acknowledged=alert.acknowledged,
        created_at=alert.created_at,
        truck_registration=alert.truck.registration_number if alert.truck else None,
        order_code=alert.order.code if alert.order else None,
    )
