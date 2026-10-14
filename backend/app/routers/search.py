from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models import (
    Driver,
    LOAD_BEARING_ORDER_STATUSES,
    TransportOrder,
    Trip,
    Truck,
)
from ..security import current_user

router = APIRouter(prefix="/api/search", tags=["search"])

LOAD_BEARING = {s.value for s in LOAD_BEARING_ORDER_STATUSES}


@router.get("", response_model=schemas.SearchResults)
def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=20, le=50),
    db: Session = Depends(get_db),
    _user=Depends(current_user),
):
    """Global lookup across trucks, drivers, orders, billing parties and trips."""
    term = f"%{q.strip()}%"
    hits: List[schemas.SearchHit] = []

    for truck in db.scalars(
        select(Truck)
        .where(
            or_(
                Truck.registration_number.ilike(term),
                Truck.base_city.ilike(term),
            )
        )
        .limit(limit)
    ):
        load = round(
            sum(o.quantity_tons for o in truck.orders if o.status in LOAD_BEARING), 2
        )
        hits.append(
            schemas.SearchHit(
                kind="truck",
                id=truck.id,
                label=truck.registration_number,
                sublabel=(
                    f"{truck.driver.name if truck.driver else 'No driver'} - "
                    f"{load}/{truck.capacity_tons}T"
                    + (f" - {truck.base_city}" if truck.base_city else "")
                ),
                badge=truck.status,
                href=f"/trucks/{truck.id}",
            )
        )

    for driver in db.scalars(
        select(Driver)
        .where(
            or_(
                Driver.name.ilike(term),
                Driver.phone.ilike(term),
                Driver.code.ilike(term),
                Driver.license_number.ilike(term),
            )
        )
        .limit(limit)
    ):
        hits.append(
            schemas.SearchHit(
                kind="driver",
                id=driver.id,
                label=driver.name,
                sublabel=(
                    f"{driver.phone} - "
                    f"{driver.truck.registration_number if driver.truck else 'No truck'}"
                ),
                badge=driver.status,
                href=f"/drivers/{driver.id}",
            )
        )

    for order in db.scalars(
        select(TransportOrder)
        .where(
            or_(
                TransportOrder.code.ilike(term),
                TransportOrder.order_number.ilike(term),
                TransportOrder.material.ilike(term),
                TransportOrder.billing_party.ilike(term),
                TransportOrder.pickup_name.ilike(term),
                TransportOrder.drop_name.ilike(term),
            )
        )
        .limit(limit)
    ):
        hits.append(
            schemas.SearchHit(
                kind="order",
                id=order.id,
                label=order.code
                + (f" / {order.order_number}" if order.order_number else ""),
                sublabel=(
                    f"{order.billing_party} - {order.material} "
                    f"{order.quantity_tons}T - {order.pickup_name} to {order.drop_name}"
                ),
                badge=order.status,
                href=f"/orders/{order.id}",
            )
        )

    seen_parties: set = set()
    for order in db.scalars(
        select(TransportOrder).where(TransportOrder.billing_party.ilike(term)).limit(200)
    ):
        key = order.billing_party.strip().lower()
        if key in seen_parties:
            continue
        seen_parties.add(key)
        hits.append(
            schemas.SearchHit(
                kind="billing_party",
                id=order.id,
                label=order.billing_party,
                sublabel="Billing party",
                badge="party",
                href=f"/orders?billing_party={order.billing_party}",
            )
        )

    for trip in db.scalars(select(Trip).where(Trip.code.ilike(term)).limit(limit)):
        hits.append(
            schemas.SearchHit(
                kind="trip",
                id=trip.id,
                label=trip.code,
                sublabel=(
                    f"{trip.truck.registration_number} - {trip.total_cargo_tons}T - "
                    f"{len(trip.orders)} orders"
                ),
                badge=trip.status,
                href=f"/trips/{trip.id}",
            )
        )

    return schemas.SearchResults(query=q, hits=hits[:limit])
