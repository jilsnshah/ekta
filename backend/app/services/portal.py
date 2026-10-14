"""Billing-party views of an order.

Everything here is deliberately narrow. A trip carries several parties'
consignments, so a party must only ever see the stops that handle its own
order -- never another party's places, order codes or weights.
"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas
from ..models import (
    Company,
    OrderStatus,
    PartyAccount,
    TransportOrder,
    Trip,
)

#: What the party is shown instead of the internal status vocabulary.
STAGE = {
    OrderStatus.NEW.value: ("placed", "Received, we are arranging a truck"),
    OrderStatus.UNASSIGNED.value: ("placed", "Received, we are arranging a truck"),
    OrderStatus.ASSIGNED.value: ("scheduled", "A truck has been arranged"),
    OrderStatus.PICKUP_PENDING.value: ("scheduled", "Truck on its way to collect"),
    OrderStatus.PICKED_UP.value: ("in_transit", "Collected and on the way"),
    OrderStatus.IN_TRANSIT.value: ("in_transit", "Collected and on the way"),
    OrderStatus.DELIVERED.value: ("delivered", "Delivered"),
    OrderStatus.CANCELLED.value: ("cancelled", "Cancelled"),
}


def stage_for(order: TransportOrder) -> tuple:
    return STAGE.get(order.status, ("placed", "Received"))


def statuses_for_stage(stage: str) -> List[str]:
    """The underlying statuses behind a party-facing stage.

    Lets the portal filter by stage in SQL; the mapping is one-way in ``STAGE``
    so this inverts it rather than duplicating the knowledge.
    """
    return [status for status, (name, _) in STAGE.items() if name == stage]


def company_name(order: TransportOrder) -> str:
    # The order keeps its own copy of the name, so a renamed or deleted
    # company does not change what was ordered.
    return order.company.name if order.company else order.billing_party


def order_brief(order: TransportOrder) -> schemas.PortalOrderBrief:
    stage, detail = stage_for(order)
    return schemas.PortalOrderBrief(
        id=order.id,
        code=order.code,
        order_number=order.order_number,
        company_id=order.company_id,
        company_name=company_name(order),
        material=order.material,
        quantity_tons=order.quantity_tons,
        status=order.status,
        pickup_name=order.pickup_name,
        drop_name=order.drop_name,
        pickup_date=order.pickup_date,
        truck_registration=order.truck.registration_number if order.truck else None,
        stage=stage,
        stage_detail=detail,
    )


def _my_stops(db: Session, order: TransportOrder) -> List[schemas.PortalStopOut]:
    """The stops on the order's trip that handle this order, and no others."""
    if not order.trip_id:
        return []
    trip = db.get(Trip, order.trip_id)
    if trip is None:
        return []

    mine: List[schemas.PortalStopOut] = []
    for stop in sorted(trip.stops, key=lambda s: s.sequence):
        if not any(o.id == order.id for o in stop.orders):
            continue
        mine.append(
            schemas.PortalStopOut(
                # Renumbered 1..n for the party: the trip's own sequence would
                # reveal how many other stops exist.
                sequence=len(mine),
                stop_type=stop.stop_type,
                status=stop.status,
                place_name=stop.place_name,
                place_address=stop.place_address,
                completed_at=stop.completed_at,
            )
        )
    return mine


def order_out(db: Session, order: TransportOrder) -> schemas.PortalOrderOut:
    truck = order.truck
    driver = truck.driver if truck else None
    trip = db.get(Trip, order.trip_id) if order.trip_id else None

    return schemas.PortalOrderOut(
        **order_brief(order).model_dump(),
        pickup_phone=order.pickup_phone,
        pickup_address=order.pickup_address,
        drop_phone=order.drop_phone,
        drop_address=order.drop_address,
        special_instructions=order.special_instructions,
        created_at=order.created_at,
        assigned_at=order.assigned_at,
        picked_up_at=order.picked_up_at,
        delivered_at=order.delivered_at,
        driver_name=driver.name if driver else None,
        driver_phone=driver.phone if driver else None,
        truck_capacity_tons=truck.capacity_tons if truck else None,
        trip_code=trip.code if trip else None,
        trip_status=trip.status if trip else None,
        my_stops=_my_stops(db, order),
    )


def company_out(db: Session, company: Company) -> schemas.CompanyOut:
    count = (
        db.scalar(
            select(func.count(TransportOrder.id)).where(
                TransportOrder.company_id == company.id
            )
        )
        or 0
    )
    return schemas.CompanyOut(
        id=company.id,
        name=company.name,
        gst_number=company.gst_number,
        contact_person=company.contact_person,
        address=company.address,
        order_count=int(count),
    )


def my_orders(db: Session, account: PartyAccount) -> List[TransportOrder]:
    """Every order this account has placed, newest first."""
    return list(
        db.scalars(
            select(TransportOrder)
            .where(TransportOrder.placed_by_account_id == account.id)
            .order_by(TransportOrder.created_at.desc(), TransportOrder.id.desc())
        )
    )


def find_my_order(
    db: Session, account: PartyAccount, order_id: int
) -> Optional[TransportOrder]:
    """One of *this* account's orders, or None.

    Scoped by ``placed_by_account_id`` so another party's order id simply
    reads as missing.
    """
    return db.scalar(
        select(TransportOrder)
        .where(TransportOrder.id == order_id)
        .where(TransportOrder.placed_by_account_id == account.id)
    )


def summary(db: Session, account: PartyAccount) -> schemas.PortalSummary:
    """Counted in SQL, so the figures do not load every order to add them up."""

    def count(stage: Optional[str] = None) -> int:
        stmt = select(func.count(TransportOrder.id)).where(
            TransportOrder.placed_by_account_id == account.id
        )
        if stage is not None:
            stmt = stmt.where(TransportOrder.status.in_(statuses_for_stage(stage)))
        return int(db.scalar(stmt) or 0)

    companies = (
        db.scalar(
            select(func.count(Company.id)).where(Company.account_id == account.id)
        )
        or 0
    )
    return schemas.PortalSummary(
        total=count(),
        awaiting_truck=count("placed"),
        scheduled=count("scheduled"),
        in_transit=count("in_transit"),
        delivered=count("delivered"),
        companies=int(companies),
    )


__all__ = [
    "STAGE",
    "statuses_for_stage",
    "company_out",
    "find_my_order",
    "my_orders",
    "order_brief",
    "order_out",
    "stage_for",
    "summary",
]
