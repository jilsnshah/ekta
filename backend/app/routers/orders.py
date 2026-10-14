from __future__ import annotations

from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..clock import utcnow
from ..database import get_db
from ..pagination import Page, PageParams, as_page, paginate
from ..models import (
    OPEN_ORDER_STATUSES,
    Company,
    OrderStatus,
    SavedPlace,
    TransportOrder,
    Trip,
)
from ..portal_security import display_phone
from ..security import current_user, require_admin
from ..services import customers as customer_service
from ..services import places as place_service
from ..services import trips as trip_service

router = APIRouter(prefix="/api/orders", tags=["orders"])

OPEN_VALUES = [s.value for s in OPEN_ORDER_STATUSES]


def _get_order(db: Session, order_id: int) -> TransportOrder:
    order = db.get(TransportOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Transport order not found")
    return order


def _next_code(db: Session) -> str:
    count = db.scalar(select(func.count(TransportOrder.id))) or 0
    return f"TO-{1000 + count + 1}"


ORDER_SORTS = {
    "pickup_date": TransportOrder.pickup_date,
    "created_at": TransportOrder.created_at,
    "quantity_tons": TransportOrder.quantity_tons,
    "billing_party": TransportOrder.billing_party,
    "code": TransportOrder.code,
}


@router.get("", response_model=Page[schemas.OrderOut])
def list_orders(
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    page: PageParams = Depends(),
    status: Optional[List[str]] = Query(default=None),
    billing_party: Optional[str] = None,
    truck_id: Optional[int] = None,
    trip_id: Optional[int] = None,
    unassigned: bool = False,
    source: Optional[str] = None,
    pickup_overdue: bool = False,
    pickup_within_days: Optional[int] = None,
    customer_id: Optional[int] = None,
    company_id: Optional[int] = None,
    search: Optional[str] = None,
    sort: str = Query("pickup_date", description=f"One of {', '.join(ORDER_SORTS)}"),
    descending: bool = False,
):
    column = ORDER_SORTS.get(sort, TransportOrder.pickup_date)
    stmt = select(TransportOrder).order_by(
        column.desc() if descending else column.asc(), TransportOrder.id.desc()
    )

    if status:
        stmt = stmt.where(TransportOrder.status.in_(status))
    if unassigned:
        stmt = stmt.where(TransportOrder.status.in_(OPEN_VALUES))
    if billing_party:
        stmt = stmt.where(TransportOrder.billing_party.ilike(f"%{billing_party}%"))
    if customer_id is not None:
        stmt = stmt.where(customer_service.orders_of(customer_id))
    if company_id is not None:
        stmt = stmt.where(TransportOrder.company_id == company_id)
    if truck_id is not None:
        stmt = stmt.where(TransportOrder.truck_id == truck_id)
    if trip_id is not None:
        stmt = stmt.where(TransportOrder.trip_id == trip_id)
    if source:
        stmt = stmt.where(TransportOrder.source == source)
    if pickup_overdue:
        stmt = stmt.where(TransportOrder.pickup_date < utcnow().date()).where(
            TransportOrder.picked_up_at.is_(None)
        )
    if pickup_within_days is not None:
        cutoff = utcnow().date() + timedelta(days=pickup_within_days)
        stmt = stmt.where(TransportOrder.pickup_date <= cutoff)
    if search:
        # Searched in SQL, not in the browser: filtering one page client-side
        # would quietly miss everything on the others.
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                TransportOrder.code.ilike(term),
                TransportOrder.order_number.ilike(term),
                TransportOrder.material.ilike(term),
                TransportOrder.billing_party.ilike(term),
                TransportOrder.pickup_name.ilike(term),
                TransportOrder.drop_name.ilike(term),
            )
        )

    rows, total = paginate(db, stmt, page)
    return as_page([serializers.order_out(o) for o in rows], total, page)


@router.get("/billing-parties", response_model=List[str])
def billing_parties(
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    search: Optional[str] = None,
    limit: int = Query(default=50, le=200),
):
    """Names already on file, to autocomplete the typed field.

    Narrowed and capped in SQL: this feeds a type-ahead, so it must stay small
    however many orders exist.
    """
    stmt = (
        select(TransportOrder.billing_party)
        .distinct()
        .order_by(TransportOrder.billing_party)
        .limit(limit)
    )
    if search:
        stmt = stmt.where(TransportOrder.billing_party.ilike(f"%{search.strip()}%"))
    return [name for name in db.scalars(stmt) if name]


@router.get("/stats", response_model=schemas.OrderStats)
def order_stats(
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    billing_party: Optional[str] = None,
    search: Optional[str] = None,
):
    """Counts and tonnage per status over the whole table.

    Deliberately ignores the status filter: these numbers label the status
    chips, which have to show what *would* be found, not what the current
    filter already narrowed to. Search and billing party do apply, because
    those bound the scope the user is looking at.

    One grouped query rather than a scan in the browser -- at a lakh of orders
    the page on screen is no sample to count from.
    """
    stmt = select(
        TransportOrder.status,
        func.count(TransportOrder.id),
        func.coalesce(func.sum(TransportOrder.quantity_tons), 0.0),
    ).group_by(TransportOrder.status)

    if billing_party:
        stmt = stmt.where(TransportOrder.billing_party.ilike(f"%{billing_party}%"))
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                TransportOrder.code.ilike(term),
                TransportOrder.order_number.ilike(term),
                TransportOrder.material.ilike(term),
                TransportOrder.billing_party.ilike(term),
                TransportOrder.pickup_name.ilike(term),
                TransportOrder.drop_name.ilike(term),
            )
        )

    by_status = {status.value: 0 for status in OrderStatus}
    tons_by_status = {status.value: 0.0 for status in OrderStatus}
    for status, count, tons in db.execute(stmt).all():
        key = status.value if hasattr(status, "value") else str(status)
        by_status[key] = int(count)
        tons_by_status[key] = round(float(tons), 2)

    return schemas.OrderStats(
        total=sum(by_status.values()),
        total_tons=round(sum(tons_by_status.values()), 2),
        by_status=by_status,
        tons_by_status=tons_by_status,
    )


@router.get("/places", response_model=Page[schemas.SavedPlaceOut])
def places(
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    page: PageParams = Depends(),
    mine_only: bool = False,
    account_id: Optional[int] = None,
    only_account: bool = False,
    search: Optional[str] = None,
):
    """The address book the control room can draw on.

    ``account_id`` narrows it to one customer's book plus the control room's,
    the customer's first -- what the order form wants once it knows who the
    order is for. Add ``only_account`` for that customer's book alone.

    Its own entries sort first, then every billing party's, each labelled with
    whose it is -- the control room raises orders on the phone for customers
    who have already saved their own godowns.
    """
    stmt = select(SavedPlace).order_by(
        # Own entries first, then the most-used.
        SavedPlace.account_id.is_(None).desc(),
        SavedPlace.use_count.desc(),
        SavedPlace.label,
    )
    if mine_only:
        stmt = stmt.where(SavedPlace.account_id.is_(None))
    if account_id is not None and only_account:
        stmt = stmt.where(SavedPlace.account_id == account_id)
    elif account_id is not None:
        stmt = stmt.where(
            or_(SavedPlace.account_id == account_id, SavedPlace.account_id.is_(None))
        ).order_by(None).order_by(
            # The customer's own first. A CASE rather than a boolean sort,
            # because databases disagree on where NULL comparisons land.
            case((SavedPlace.account_id == account_id, 0), else_=1),
            SavedPlace.use_count.desc(),
            SavedPlace.label,
        )
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                SavedPlace.label.ilike(term),
                SavedPlace.address.ilike(term),
                SavedPlace.phone.ilike(term),
            )
        )

    rows, total = paginate(db, stmt, page)

    items = []
    for place in rows:
        if place.account_id is None:
            items.append(place_service.out(place, owner="Control room"))
            continue
        account = place.account
        # A named account reads better than a bare number.
        owner = (
            (account.full_name or display_phone(account.phone)) if account else "Customer"
        )
        items.append(place_service.out(place, owner=owner))
    return as_page(items, total, page)


@router.post("/places", response_model=schemas.SavedPlaceOut, status_code=201)
def create_place(
    payload: schemas.SavedPlaceCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Add a control-room entry. A customer's own book is never written here."""
    place = place_service.remember(
        db, payload.label, payload.phone, payload.address, account_id=None
    )
    db.commit()
    db.refresh(place)
    return place_service.out(place, owner="Control room")


@router.patch("/places/{place_id}", response_model=schemas.SavedPlaceOut)
def update_place(
    place_id: int,
    payload: schemas.SavedPlaceUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    place = place_service.owned(db, place_id, None)
    if place is None:
        raise HTTPException(
            status_code=404,
            detail="Address not found in the control room's own book",
        )
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(place, key, value.strip() or None if isinstance(value, str) else value)
    place.match_key = place_service.match_key(place.label, place.address)
    db.commit()
    db.refresh(place)
    return place_service.out(place, owner="Control room")


@router.delete("/places/{place_id}", status_code=204)
def delete_place(
    place_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Only the control room's own entries. A customer's book is theirs."""
    place = place_service.owned(db, place_id, None)
    if place is None:
        raise HTTPException(
            status_code=404,
            detail="Address not found in the control room's own book",
        )
    db.delete(place)
    db.commit()


@router.get("/{order_id}", response_model=schemas.OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db), _user=Depends(current_user)):
    return serializers.order_out(_get_order(db, order_id))


@router.post("", response_model=schemas.OrderOut, status_code=201)
def create_order(
    payload: schemas.OrderCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    data = payload.model_dump()

    # Billed to a customer's company: the order joins that customer, and the
    # name on it is the company's. Otherwise a one-off typed name.
    company = None
    company_id = data.pop("company_id", None)
    if company_id is not None:
        company = db.get(Company, company_id)
        if company is None:
            raise HTTPException(status_code=404, detail="Company not found")
        data["billing_party"] = company.name
    elif not (data.get("billing_party") or "").strip():
        raise HTTPException(
            status_code=422, detail="Choose the customer's company, or type a billing party"
        )

    for key in (
        "billing_party",
        "material",
        "pickup_name",
        "pickup_address",
        "drop_name",
        "drop_address",
    ):
        data[key] = data[key].strip()
    for key in ("order_number", "pickup_phone", "drop_phone", "special_instructions"):
        if data.get(key):
            data[key] = data[key].strip() or None

    order = TransportOrder(
        code=_next_code(db),
        status=OrderStatus.UNASSIGNED.value,
        company_id=company.id if company else None,
        **data,
    )
    db.add(order)

    # Addresses go into the book of whoever the order is for: the customer's
    # own, so they find their godowns already saved when they sign in, or the
    # control room's for a one-off with no account. The control room sees
    # every book either way.
    owner = company.account_id if company else None
    place_service.remember(
        db, order.pickup_name, order.pickup_phone, order.pickup_address, owner
    )
    place_service.remember(
        db, order.drop_name, order.drop_phone, order.drop_address, owner
    )
    db.commit()
    db.refresh(order)
    return serializers.order_out(order)


@router.patch("/{order_id}", response_model=schemas.OrderOut)
def update_order(
    order_id: int,
    payload: schemas.OrderUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    order = _get_order(db, order_id)
    data = payload.model_dump(exclude_unset=True)

    if data.get("status") and data["status"] not in [s.value for s in OrderStatus]:
        raise HTTPException(status_code=422, detail="Unknown order status")

    new_qty = data.get("quantity_tons")
    if new_qty is not None and order.truck_id is not None:
        from ..services import capacity as capacity_service

        snap = capacity_service.snapshot(db, order.truck)
        other_load = snap.current_load_tons - order.quantity_tons
        if other_load + new_qty > order.truck.capacity_tons + 1e-6:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Raising {order.code} to {new_qty}T would push "
                    f"{order.truck.registration_number} to "
                    f"{round(other_load + new_qty, 3)}T against a capacity of "
                    f"{order.truck.capacity_tons}T."
                ),
            )

    for key, value in data.items():
        setattr(order, key, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(order)

    # A quantity or address change shifts the plan, so re-plan the live trip.
    if order.trip_id and (
        new_qty is not None
        or any(
            key.startswith("pickup_") or key.startswith("drop_") for key in data
        )
    ):
        trip = db.get(Trip, order.trip_id)
        if trip is not None:
            trip_service.replan(db, trip)
            db.commit()

    db.refresh(order)
    return serializers.order_out(order)


@router.post("/{order_id}/cancel", response_model=schemas.OrderOut)
def cancel_order(
    order_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)
):
    order = _get_order(db, order_id)
    if order.status == OrderStatus.DELIVERED.value:
        raise HTTPException(status_code=422, detail=f"{order.code} is already delivered")
    if order.picked_up_at is not None:
        raise HTTPException(
            status_code=422,
            detail=f"{order.code} is already on board and cannot be cancelled",
        )
    trip = db.get(Trip, order.trip_id) if order.trip_id else None
    order.status = OrderStatus.CANCELLED.value
    order.truck_id = None
    order.trip_id = None
    db.commit()
    if trip is not None:
        db.refresh(trip)
        if trip.orders:
            trip_service.replan(db, trip)
            db.commit()
    db.refresh(order)
    return serializers.order_out(order)


@router.delete("/{order_id}", status_code=204)
def delete_order(
    order_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)
):
    order = _get_order(db, order_id)
    if order.truck_id is not None:
        raise HTTPException(
            status_code=409,
            detail=f"{order.code} is assigned to a truck. Unassign it first.",
        )
    db.delete(order)
    db.commit()
