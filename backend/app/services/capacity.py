"""Authoritative capacity accounting.

The invariant enforced here is the system's central business rule:

    SUM(quantity_tons of load-bearing orders on a truck) <= truck.capacity_tons

The frontend mirrors this check for instant feedback, but this module is the
only thing that decides whether an assignment is legal.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    LOAD_BEARING_ORDER_STATUSES,
    OrderStatus,
    TransportOrder,
    Truck,
)

LOAD_BEARING_VALUES = [s.value for s in LOAD_BEARING_ORDER_STATUSES]


@dataclass
class CapacitySnapshot:
    truck_id: int
    capacity_tons: float
    current_load_tons: float
    order_count: int

    @property
    def available_tons(self) -> float:
        return round(self.capacity_tons - self.current_load_tons, 3)

    @property
    def utilisation_percent(self) -> float:
        if self.capacity_tons <= 0:
            return 0.0
        return round(self.current_load_tons / self.capacity_tons * 100, 1)


class CapacityError(ValueError):
    """Raised when an assignment would breach the capacity invariant."""

    def __init__(self, message: str, snapshot: CapacitySnapshot, requested_tons: float):
        super().__init__(message)
        self.snapshot = snapshot
        self.requested_tons = requested_tons

    def detail(self) -> dict:
        return {
            "error": "capacity_exceeded",
            "message": str(self),
            "truck_id": self.snapshot.truck_id,
            "capacity_tons": self.snapshot.capacity_tons,
            "current_load_tons": self.snapshot.current_load_tons,
            "available_tons": self.snapshot.available_tons,
            "requested_tons": round(self.requested_tons, 3),
            "overflow_tons": round(
                self.requested_tons - self.snapshot.available_tons, 3
            ),
        }


def load_bearing_orders(db: Session, truck_id: int) -> List[TransportOrder]:
    stmt = (
        select(TransportOrder)
        .where(TransportOrder.truck_id == truck_id)
        .where(TransportOrder.status.in_(LOAD_BEARING_VALUES))
        .order_by(TransportOrder.pickup_date)
    )
    return list(db.scalars(stmt))


def snapshot(db: Session, truck: Truck) -> CapacitySnapshot:
    orders = load_bearing_orders(db, truck.id)
    load = round(sum(o.quantity_tons for o in orders), 3)
    return CapacitySnapshot(
        truck_id=truck.id,
        capacity_tons=truck.capacity_tons,
        current_load_tons=load,
        order_count=len(orders),
    )


def validate_assignment(
    db: Session, truck: Truck, orders: Sequence[TransportOrder]
) -> CapacitySnapshot:
    """Check that adding ``orders`` keeps the truck within capacity.

    Orders already counted against this truck are excluded from the delta so
    re-submitting an existing assignment is idempotent rather than a breach.
    """
    snap = snapshot(db, truck)
    incoming = [o for o in orders if o.truck_id != truck.id]
    requested = round(sum(o.quantity_tons for o in incoming), 3)

    if requested > snap.available_tons + 1e-6:
        codes = ", ".join(o.code for o in incoming)
        raise CapacityError(
            f"Assigning {requested}T ({codes}) to {truck.registration_number} would "
            f"exceed its capacity: {snap.current_load_tons}T of "
            f"{snap.capacity_tons}T already loaded, {snap.available_tons}T free.",
            snap,
            requested,
        )
    return snap


def assert_assignable(orders: Iterable[TransportOrder]) -> None:
    """Reject orders that are not in an assignable state."""
    blocked = [
        o
        for o in orders
        if o.status
        in (
            OrderStatus.DELIVERED.value,
            OrderStatus.CANCELLED.value,
            OrderStatus.PICKED_UP.value,
            OrderStatus.IN_TRANSIT.value,
        )
    ]
    if blocked:
        detail = ", ".join(f"{o.code} ({o.status})" for o in blocked)
        raise ValueError(f"These orders can no longer be assigned: {detail}")
