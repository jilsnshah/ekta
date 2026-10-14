"""Alert generation.

Every rule produces a stable ``dedupe_key`` so a persistent condition raises
one alert instead of one per scan cycle.

There is no delivery deadline in the system, so the time-based rules work from
the pickup date the operator entered.
"""
from __future__ import annotations

from datetime import timedelta
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..clock import utcnow
from ..models import (
    Alert,
    AlertKind,
    AlertSeverity,
    LOAD_BEARING_ORDER_STATUSES,
    OPEN_ORDER_STATUSES,
    TransportOrder,
    Trip,
    Truck,
    TruckStatus,
)
from . import capacity

UNASSIGNED_GRACE_HOURS = 12


def _raise_alert(
    db: Session,
    kind: AlertKind,
    severity: AlertSeverity,
    title: str,
    message: str,
    dedupe_key: str,
    truck_id: Optional[int] = None,
    order_id: Optional[int] = None,
    trip_id: Optional[int] = None,
    driver_id: Optional[int] = None,
) -> Optional[Alert]:
    existing = db.scalar(select(Alert).where(Alert.dedupe_key == dedupe_key))
    if existing is not None:
        return None
    alert = Alert(
        kind=kind.value,
        severity=severity.value,
        title=title,
        message=message,
        dedupe_key=dedupe_key,
        truck_id=truck_id,
        order_id=order_id,
        trip_id=trip_id,
        driver_id=driver_id,
        created_at=utcnow(),
    )
    db.add(alert)
    return alert


def scan(db: Session) -> List[Alert]:
    """Run every rule once. Returns the newly created alerts."""
    now = utcnow()
    today = now.date()
    created: List[Alert] = []

    def push(alert: Optional[Alert]) -> None:
        if alert is not None:
            created.append(alert)

    # --- Truck level -------------------------------------------------------- #
    for truck in db.scalars(select(Truck)):
        snap = capacity.snapshot(db, truck)

        if snap.current_load_tons > truck.capacity_tons + 1e-6:
            push(
                _raise_alert(
                    db,
                    AlertKind.CAPACITY_EXCEEDED,
                    AlertSeverity.CRITICAL,
                    f"Truck over capacity - {truck.registration_number}",
                    f"{truck.registration_number} is carrying "
                    f"{snap.current_load_tons}T against a rated capacity of "
                    f"{truck.capacity_tons}T.",
                    f"capacity:{truck.id}:{snap.current_load_tons}",
                    truck_id=truck.id,
                )
            )

        # A loaded truck with nobody to drive it cannot be dispatched.
        if truck.driver_id is None and snap.order_count > 0:
            push(
                _raise_alert(
                    db,
                    AlertKind.TRUCK_WITHOUT_DRIVER,
                    AlertSeverity.WARNING,
                    f"No driver assigned - {truck.registration_number}",
                    f"{truck.registration_number} is carrying {snap.order_count} "
                    f"order(s) ({snap.current_load_tons}T) but has no driver.",
                    f"nodriver:{truck.id}:{snap.order_count}",
                    truck_id=truck.id,
                )
            )

        if truck.status == TruckStatus.DELAYED.value:
            trip = db.get(Trip, truck.current_trip_id) if truck.current_trip_id else None
            push(
                _raise_alert(
                    db,
                    AlertKind.TRUCK_DELAYED,
                    AlertSeverity.WARNING,
                    f"Truck flagged delayed - {truck.registration_number}",
                    f"{truck.registration_number}"
                    + (f" on {trip.code}" if trip else "")
                    + " is marked delayed. Check the orders it is carrying.",
                    f"delayed:{truck.id}:{trip.id if trip else 'none'}",
                    truck_id=truck.id,
                    trip_id=trip.id if trip else None,
                    driver_id=truck.driver_id,
                )
            )

    # --- Order level -------------------------------------------------------- #
    watched = [s.value for s in LOAD_BEARING_ORDER_STATUSES] + [
        s.value for s in OPEN_ORDER_STATUSES
    ]
    orders = list(
        db.scalars(select(TransportOrder).where(TransportOrder.status.in_(watched)))
    )

    for order in orders:
        # Collection day has passed and the goods are still not on a truck.
        if order.picked_up_at is None and order.pickup_date < today:
            days = (today - order.pickup_date).days
            unassigned = order.truck_id is None
            push(
                _raise_alert(
                    db,
                    AlertKind.PICKUP_OVERDUE,
                    AlertSeverity.CRITICAL if unassigned else AlertSeverity.WARNING,
                    f"Pickup overdue - {order.code}",
                    f"{order.code} ({order.material}, {order.quantity_tons}T for "
                    f"{order.billing_party}) was due for collection at "
                    f"{order.pickup_name} on "
                    f"{order.pickup_date.strftime('%d %b')}, "
                    f"{days} day{'s' if days != 1 else ''} ago."
                    + (" It is still unassigned." if unassigned else ""),
                    f"pickupoverdue:{order.id}:{order.pickup_date.isoformat()}",
                    order_id=order.id,
                    truck_id=order.truck_id,
                    trip_id=order.trip_id,
                )
            )

        # Sitting in the backlog too long.
        if (
            order.truck_id is None
            and order.created_at is not None
            and order.created_at < now - timedelta(hours=UNASSIGNED_GRACE_HOURS)
            and order.status in [s.value for s in OPEN_ORDER_STATUSES]
        ):
            push(
                _raise_alert(
                    db,
                    AlertKind.ORDER_UNASSIGNED_TOO_LONG,
                    AlertSeverity.WARNING,
                    f"Order still unassigned - {order.code}",
                    f"{order.code} ({order.quantity_tons}T, {order.pickup_name} to "
                    f"{order.drop_name}) has been waiting for a truck for over "
                    f"{UNASSIGNED_GRACE_HOURS} hours.",
                    f"backlog:{order.id}",
                    order_id=order.id,
                )
            )

    if created:
        db.commit()
        for alert in created:
            db.refresh(alert)
    return created


def scan_quietly(db: Session) -> List[Alert]:
    """``scan`` that never raises, for use from request handlers."""
    try:
        return scan(db)
    except Exception:
        db.rollback()
        return []
