"""Trip lifecycle: creation, re-planning, stop progression, completion."""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..clock import utcnow
from ..models import (
    DriverStatus,
    OrderStatus,
    StopStatus,
    StopType,
    TransportOrder,
    Trip,
    TripStatus,
    TripStop,
    Truck,
    TruckStatus,
)
from . import capacity
from .sequencing import RoutePlan, plan, plan_from_manual_order

ACTIVE_TRIP_STATUSES = (
    TripStatus.PLANNED.value,
    TripStatus.DISPATCHED.value,
    TripStatus.IN_PROGRESS.value,
)


def next_trip_code(db: Session) -> str:
    year = utcnow().year
    count = db.scalar(select(func.count(Trip.id))) or 0
    return f"TRIP-{year}-{count + 1:04d}"


def completed_stops(trip: Trip) -> List[TripStop]:
    """The locked prefix: stops the operator has already closed."""
    return sorted(
        (s for s in trip.stops if s.status == StopStatus.COMPLETED.value),
        key=lambda s: s.sequence,
    )


def _materialise_stops(db: Session, trip: Trip, route: RoutePlan) -> None:
    """Replace a trip's *pending* stops with the ones in ``route``.

    Completed stops are never rebuilt. They keep their row, their sequence and
    their timestamp, and the new stops are laid out after them -- otherwise
    re-planning a trip that is already under way would erase the record of
    what the driver has done.
    """
    locked = completed_stops(trip)
    offset = len(locked)

    for stop in [s for s in trip.stops if s.status != StopStatus.COMPLETED.value]:
        db.delete(stop)
    db.flush()

    orders_by_id: Dict[int, TransportOrder] = {o.id: o for o in trip.orders}
    for index, planned in enumerate(route.stops):
        stop = TripStop(
            trip_id=trip.id,
            sequence=offset + index,
            stop_type=planned.stop_type.value,
            status=StopStatus.PENDING.value,
            place_name=planned.place.name,
            place_phone=planned.place.phone,
            place_address=planned.place.address,
        )
        stop.orders = [
            orders_by_id[oid] for oid in planned.order_ids if oid in orders_by_id
        ]
        db.add(stop)

    trip.total_cargo_tons = round(sum(o.quantity_tons for o in trip.orders), 3)
    db.flush()
    db.refresh(trip)
    _recompute_progress(trip)
    db.flush()


def create_trip(
    db: Session, truck: Truck, orders: Sequence[TransportOrder]
) -> Trip:
    """Build a planned trip for ``orders`` and attach them to ``truck``."""
    if not orders:
        raise ValueError("A trip needs at least one transport order")
    if truck.driver_id is None:
        raise ValueError(
            f"{truck.registration_number} has no driver assigned; assign a driver "
            f"before creating a trip"
        )

    existing = db.scalar(
        select(Trip)
        .where(Trip.truck_id == truck.id)
        .where(Trip.status.in_(ACTIVE_TRIP_STATUSES))
    )
    if existing is not None:
        # Fold the new orders into the open trip rather than opening a second.
        return attach_orders(db, existing, orders)

    capacity.validate_assignment(db, truck, orders)

    trip = Trip(
        code=next_trip_code(db),
        truck_id=truck.id,
        driver_id=truck.driver_id,
        status=TripStatus.PLANNED.value,
    )
    db.add(trip)
    db.flush()

    for order in orders:
        order.truck_id = truck.id
        order.trip_id = trip.id
        order.assigned_at = order.assigned_at or utcnow()
        if order.status in (OrderStatus.NEW.value, OrderStatus.UNASSIGNED.value):
            order.status = OrderStatus.ASSIGNED.value
    db.flush()
    db.refresh(trip)

    _materialise_stops(db, trip, plan(list(trip.orders), truck.capacity_tons))

    truck.current_trip_id = trip.id
    if truck.status == TruckStatus.AVAILABLE.value:
        truck.status = TruckStatus.ASSIGNED.value
    db.commit()
    db.refresh(trip)
    return trip


def attach_orders(db: Session, trip: Trip, orders: Sequence[TransportOrder]) -> Trip:
    """Add orders to an open trip and re-plan the remaining stops."""
    truck = trip.truck
    new_orders = [o for o in orders if o.trip_id != trip.id]
    if new_orders:
        capacity.validate_assignment(db, truck, new_orders)
        for order in new_orders:
            order.truck_id = truck.id
            order.trip_id = trip.id
            order.assigned_at = order.assigned_at or utcnow()
            if order.status in (OrderStatus.NEW.value, OrderStatus.UNASSIGNED.value):
                order.status = OrderStatus.ASSIGNED.value
        db.flush()
        db.refresh(trip)
        replan(db, trip)
    db.commit()
    db.refresh(trip)
    return trip


def detach_order(db: Session, trip: Trip, order: TransportOrder) -> Trip:
    """Pull an order off a trip. Only legal before it has been picked up."""
    if order.picked_up_at is not None:
        raise ValueError(
            f"{order.code} has already been picked up and cannot be unassigned"
        )
    order.trip_id = None
    order.truck_id = None
    order.assigned_at = None
    order.status = OrderStatus.UNASSIGNED.value
    db.flush()
    db.refresh(trip)

    if not trip.orders:
        truck = trip.truck
        trip.status = TripStatus.CANCELLED.value
        if truck.current_trip_id == trip.id:
            truck.current_trip_id = None
            truck.status = TruckStatus.AVAILABLE.value
        for stop in list(trip.stops):
            db.delete(stop)
    else:
        replan(db, trip)
    db.commit()
    db.refresh(trip)
    return trip


def replan(db: Session, trip: Trip) -> Trip:
    """Recompute the stop order for everything not yet delivered.

    Stops already completed stay completed; only the pending tail is rebuilt,
    and pickups that have already happened are dropped from it.
    """
    truck = trip.truck
    picked_up_ids = {o.id for o in trip.orders if o.picked_up_at is not None}
    pending_orders = [
        o for o in trip.orders if o.status != OrderStatus.DELIVERED.value
    ]

    if not pending_orders:
        trip.progress_percent = 100.0
        db.flush()
        return trip

    route = plan(pending_orders, truck.capacity_tons)
    route.stops = [
        s
        for s in route.stops
        if not (
            s.stop_type is StopType.PICKUP
            and all(oid in picked_up_ids for oid in s.order_ids)
        )
    ]
    _materialise_stops(db, trip, route)
    db.flush()
    return trip


def reorder_stops(db: Session, trip: Trip, stop_specs: Sequence[Dict]) -> Trip:
    """Apply an admin-supplied stop order, re-validating all constraints.

    ``stop_specs`` must list every stop on the trip. Completed stops have to
    come first and unchanged: they have already happened, so they cannot be
    moved. Only the pending tail is rebuilt.
    """
    locked = completed_stops(trip)

    if len(stop_specs) < len(locked):
        raise ValueError("The stop order must include every stop on the trip")

    for stop, spec in zip(locked, stop_specs):
        same = (
            spec.get("stop_type") == stop.stop_type
            and sorted(spec.get("order_ids") or []) == sorted(o.id for o in stop.orders)
        )
        if not same:
            raise ValueError(
                f"Stop {stop.sequence + 1} ({stop.place_name}) is already "
                f"completed and cannot be moved"
            )

    route = plan_from_manual_order(
        list(trip.orders),
        stop_specs,
        trip.truck.capacity_tons,
        locked_stops=len(locked),
    )
    _materialise_stops(db, trip, route)
    db.commit()
    db.refresh(trip)
    return trip


def start_trip(db: Session, trip: Trip) -> Trip:
    if trip.status in (TripStatus.COMPLETED.value, TripStatus.CANCELLED.value):
        raise ValueError(f"{trip.code} is {trip.status} and cannot be started")
    trip.status = TripStatus.IN_PROGRESS.value
    trip.started_at = trip.started_at or utcnow()
    truck = trip.truck
    truck.status = TruckStatus.IN_TRANSIT.value
    truck.current_trip_id = trip.id
    if truck.driver is not None:
        truck.driver.status = DriverStatus.ON_TRIP.value
    for order in trip.orders:
        if order.status == OrderStatus.ASSIGNED.value:
            order.status = OrderStatus.PICKUP_PENDING.value
    db.commit()
    db.refresh(trip)
    return trip


def _recompute_progress(trip: Trip) -> None:
    if not trip.stops:
        trip.progress_percent = 100.0 if trip.completed_at else 0.0
        return
    done = len([s for s in trip.stops if s.status == StopStatus.COMPLETED.value])
    trip.progress_percent = round(done / len(trip.stops) * 100, 1)


def stop_blocked_by(trip: Trip, stop: TripStop) -> Optional[TripStop]:
    """The earlier stop that must be closed first, if any.

    Stops are closed in order; this is the single definition of that rule, so
    the control room and the driver app cannot drift apart on it.
    """
    earlier = [
        s
        for s in trip.stops
        if s.sequence < stop.sequence and s.status != StopStatus.COMPLETED.value
    ]
    return min(earlier, key=lambda s: s.sequence) if earlier else None


def complete_stop(db: Session, trip: Trip, stop: TripStop) -> Trip:
    """Mark a stop done and roll its orders to the next status."""
    now = utcnow()
    stop.status = StopStatus.COMPLETED.value
    stop.completed_at = now

    for order in stop.orders:
        if stop.stop_type == StopType.PICKUP.value:
            order.picked_up_at = order.picked_up_at or now
            order.status = OrderStatus.IN_TRANSIT.value
        else:
            order.delivered_at = order.delivered_at or now
            order.status = OrderStatus.DELIVERED.value

    _recompute_progress(trip)

    pending = [s for s in trip.stops if s.status != StopStatus.COMPLETED.value]
    truck = trip.truck
    if pending:
        truck.status = TruckStatus.IN_TRANSIT.value
    else:
        finish_trip(db, trip)

    db.commit()
    db.refresh(trip)
    return trip


def finish_trip(db: Session, trip: Trip) -> Trip:
    now = utcnow()
    trip.status = TripStatus.COMPLETED.value
    trip.completed_at = now
    trip.progress_percent = 100.0

    truck = trip.truck
    truck.current_trip_id = None
    truck.status = TruckStatus.AVAILABLE.value
    if truck.driver is not None:
        truck.driver.status = DriverStatus.AVAILABLE.value

    for order in trip.orders:
        if order.status != OrderStatus.CANCELLED.value:
            order.status = OrderStatus.DELIVERED.value
            order.delivered_at = order.delivered_at or now
    db.flush()
    return trip


def cancel_trip(db: Session, trip: Trip) -> Trip:
    trip.status = TripStatus.CANCELLED.value
    truck = trip.truck
    if truck.current_trip_id == trip.id:
        truck.current_trip_id = None
        truck.status = TruckStatus.AVAILABLE.value
    if truck.driver is not None:
        truck.driver.status = DriverStatus.AVAILABLE.value
    for order in trip.orders:
        if order.delivered_at is None:
            order.trip_id = None
            order.truck_id = None
            order.picked_up_at = None
            order.assigned_at = None
            order.status = OrderStatus.UNASSIGNED.value
    db.commit()
    db.refresh(trip)
    return trip


def next_stop(trip: Trip) -> Optional[TripStop]:
    pending = [s for s in trip.stops if s.status != StopStatus.COMPLETED.value]
    return pending[0] if pending else None


def active_trip_for_truck(db: Session, truck_id: int) -> Optional[Trip]:
    return db.scalar(
        select(Trip)
        .where(Trip.truck_id == truck_id)
        .where(Trip.status.in_(ACTIVE_TRIP_STATUSES))
        .order_by(Trip.created_at.desc())
    )
