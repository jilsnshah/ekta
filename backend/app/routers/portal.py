"""The billing-party portal.

A party signs in with a mobile number and an OTP, registers one or more
companies, places orders against them, and tracks those orders.

Every endpoint here is scoped to the signed-in account. Nothing in this module
may return another party's data, and none of it accepts a staff token.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import schemas
from ..clock import utcnow
from ..config import get_settings
from ..database import get_db
from ..pagination import Page, PageParams, as_page, paginate
from ..models import (
    Company,
    OrderSource,
    OrderStatus,
    PartyAccount,
    SavedPlace,
    TransportOrder,
)
from ..portal_security import (
    create_party_token,
    current_party,
    display_phone,
    normalise_phone,
    owned_company,
    verify_otp,
)
from ..services import places as place_service
from ..services import customers as customer_service
from ..services import portal as portal_service
from ..services.realtime import hub

router = APIRouter(prefix="/api/portal", tags=["portal"])


# --------------------------------------------------------------------------- #
# Authentication
# --------------------------------------------------------------------------- #
@router.post("/auth/request-otp", response_model=schemas.OtpRequestResult)
def request_otp(payload: schemas.OtpRequest):
    """Begin a sign-in.

    With a real SMS gateway this would generate and send a code. While the
    fixed development code is configured it simply confirms the number and
    tells the caller what to type.
    """
    try:
        phone = normalise_phone(payload.phone)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    fixed = (get_settings().portal_otp_fixed or "").strip()
    if not fixed:
        raise HTTPException(
            status_code=503,
            detail="OTP delivery is not configured on this server",
        )

    return schemas.OtpRequestResult(
        phone=display_phone(phone),
        sent=True,
        development_hint=f"Development build: use {fixed}",
    )


@router.post("/auth/verify", response_model=schemas.PartySession)
def verify(payload: schemas.OtpVerify, db: Session = Depends(get_db)):
    """Complete a sign-in, creating the account on first use."""
    try:
        phone = normalise_phone(payload.phone)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if not verify_otp(payload.otp):
        raise HTTPException(status_code=401, detail="That code is not correct")

    account = db.scalar(select(PartyAccount).where(PartyAccount.phone == phone))
    if account is None:
        account = PartyAccount(phone=phone)
        db.add(account)
        db.flush()
    if not account.is_active:
        raise HTTPException(status_code=403, detail="This account has been disabled")

    account.last_login_at = utcnow()
    db.commit()
    db.refresh(account)

    return schemas.PartySession(
        access_token=create_party_token(account),
        account_id=account.id,
        phone=display_phone(account.phone),
        full_name=account.full_name,
        company_count=len(account.companies),
    )


@router.get("/me", response_model=schemas.PartySession)
def me(account: PartyAccount = Depends(current_party)):
    """Re-issue the session, so a reload can confirm the token is still good."""
    return schemas.PartySession(
        access_token=create_party_token(account),
        account_id=account.id,
        phone=display_phone(account.phone),
        full_name=account.full_name,
        company_count=len(account.companies),
    )


@router.patch("/me", response_model=schemas.PartySession)
def update_me(
    payload: schemas.PartyProfileUpdate,
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
):
    if payload.full_name is not None:
        account.full_name = payload.full_name.strip() or None
    db.commit()
    db.refresh(account)
    return me(account)


# --------------------------------------------------------------------------- #
# Companies
# --------------------------------------------------------------------------- #
@router.get("/companies", response_model=List[schemas.CompanyOut])
def list_companies(
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
    limit: int = Query(default=100, le=200),
):
    """Not paged: an account has a handful of companies and the order form
    needs them all at once to offer a choice."""
    companies = db.scalars(
        select(Company)
        .where(Company.account_id == account.id)
        .order_by(Company.name)
        .limit(limit)
    )
    return [portal_service.company_out(db, c) for c in companies]


@router.post("/companies", response_model=schemas.CompanyOut, status_code=201)
def create_company(
    payload: schemas.CompanyCreate,
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
):
    company = customer_service.add_company(db, account, payload)
    db.commit()
    db.refresh(company)
    return portal_service.company_out(db, company)


@router.patch("/companies/{company_id}", response_model=schemas.CompanyOut)
def update_company(
    company_id: int,
    payload: schemas.CompanyUpdate,
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
):
    company = owned_company(db, account, company_id)
    data = payload.model_dump(exclude_unset=True)

    if data.get("name"):
        name = data["name"].strip()
        clash = db.scalar(
            select(Company)
            .where(Company.account_id == account.id)
            .where(func.lower(Company.name) == name.lower())
            .where(Company.id != company.id)
        )
        if clash is not None:
            raise HTTPException(
                status_code=409, detail=f"You have already added “{clash.name}”"
            )
        data["name"] = name

    for key, value in data.items():
        setattr(company, key, value.strip() or None if isinstance(value, str) else value)
    db.commit()
    db.refresh(company)
    return portal_service.company_out(db, company)


@router.delete("/companies/{company_id}", status_code=204)
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
):
    company = owned_company(db, account, company_id)
    placed = (
        db.scalar(
            select(func.count(TransportOrder.id)).where(
                TransportOrder.company_id == company.id
            )
        )
        or 0
    )
    if placed:
        raise HTTPException(
            status_code=409,
            detail=(
                f"“{company.name}” has {placed} order(s) on file and cannot be "
                f"removed. The order history would lose its billing party."
            ),
        )
    db.delete(company)
    db.commit()


# --------------------------------------------------------------------------- #
# Saved addresses
# --------------------------------------------------------------------------- #
@router.get("/places", response_model=Page[schemas.SavedPlaceOut])
def list_places(
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
    page: PageParams = Depends(),
    search: Optional[str] = None,
):
    """This account's address book, most-used first."""
    stmt = (
        select(SavedPlace)
        .where(SavedPlace.account_id == account.id)
        .order_by(SavedPlace.use_count.desc(), SavedPlace.label)
    )
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(SavedPlace.label.ilike(term), SavedPlace.address.ilike(term))
        )
    rows, total = paginate(db, stmt, page)
    return as_page([place_service.out(p) for p in rows], total, page)


@router.post("/places", response_model=schemas.SavedPlaceOut, status_code=201)
def create_place(
    payload: schemas.SavedPlaceCreate,
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
):
    place = place_service.remember(
        db, payload.label, payload.phone, payload.address, account_id=account.id
    )
    db.commit()
    db.refresh(place)
    return place_service.out(place)


@router.patch("/places/{place_id}", response_model=schemas.SavedPlaceOut)
def update_place(
    place_id: int,
    payload: schemas.SavedPlaceUpdate,
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
):
    place = place_service.owned(db, place_id, account.id)
    if place is None:
        raise HTTPException(status_code=404, detail="Address not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(place, key, value.strip() or None if isinstance(value, str) else value)
    # Keep the identity in step, so an edit does not create a duplicate later.
    place.match_key = place_service.match_key(place.label, place.address)
    db.commit()
    db.refresh(place)
    return place_service.out(place)


@router.delete("/places/{place_id}", status_code=204)
def delete_place(
    place_id: int,
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
):
    place = place_service.owned(db, place_id, account.id)
    if place is None:
        raise HTTPException(status_code=404, detail="Address not found")
    # Orders keep their own copy of the address, so removing a book entry
    # never changes what was ordered.
    db.delete(place)
    db.commit()


# --------------------------------------------------------------------------- #
# Orders
# --------------------------------------------------------------------------- #
@router.get("/summary", response_model=schemas.PortalSummary)
def summary(
    db: Session = Depends(get_db), account: PartyAccount = Depends(current_party)
):
    return portal_service.summary(db, account)


@router.get("/orders", response_model=Page[schemas.PortalOrderBrief])
def list_orders(
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
    page: PageParams = Depends(),
    stage: Optional[str] = None,
    search: Optional[str] = None,
):
    """This account's orders, newest first -- including any the control room
    raised for one of their companies.

    ``stage`` is the party-facing grouping, mapped back to the underlying
    statuses so the filter runs in SQL rather than over one page.
    """
    stmt = (
        select(TransportOrder)
        .where(customer_service.orders_of(account.id))
        .order_by(TransportOrder.created_at.desc(), TransportOrder.id.desc())
    )

    if stage:
        statuses = portal_service.statuses_for_stage(stage)
        if not statuses:
            raise HTTPException(status_code=422, detail="Unknown stage")
        stmt = stmt.where(TransportOrder.status.in_(statuses))

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

    rows, total = paginate(db, stmt, page)
    return as_page([portal_service.order_brief(o) for o in rows], total, page)


@router.get("/orders/{order_id}", response_model=schemas.PortalOrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
):
    order = portal_service.find_my_order(db, account, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return portal_service.order_out(db, order)


def _next_code(db: Session) -> str:
    count = db.scalar(select(func.count(TransportOrder.id))) or 0
    return f"TO-{1000 + count + 1}"


@router.post("/orders", response_model=schemas.PortalOrderOut, status_code=201)
async def create_order(
    payload: schemas.PortalOrderCreate,
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
):
    """Place an order against one of the account's own companies."""
    company = owned_company(db, account, payload.company_id)

    data = payload.model_dump()
    data.pop("company_id")
    for key in ("material", "pickup_name", "pickup_address", "drop_name", "drop_address"):
        data[key] = data[key].strip()
    for key in ("order_number", "pickup_phone", "drop_phone", "special_instructions"):
        if data.get(key):
            data[key] = data[key].strip() or None

    order = TransportOrder(
        code=_next_code(db),
        status=OrderStatus.UNASSIGNED.value,
        source=OrderSource.PORTAL.value,
        company_id=company.id,
        placed_by_account_id=account.id,
        # Copied so the admin view and the order history read the same even if
        # the company is later renamed.
        billing_party=company.name,
        **data,
    )
    db.add(order)

    # Fill the address book as a by-product of ordering, so the next order can
    # pick these places instead of retyping them.
    place_service.remember(
        db, order.pickup_name, order.pickup_phone, order.pickup_address, account.id
    )
    place_service.remember(
        db, order.drop_name, order.drop_phone, order.drop_address, account.id
    )

    db.commit()
    db.refresh(order)

    # Let an open control-room dashboard pick the new order up immediately.
    await hub.broadcast(
        "order_placed",
        {
            "order_id": order.id,
            "code": order.code,
            "billing_party": order.billing_party,
            "quantity_tons": order.quantity_tons,
            "pickup_date": order.pickup_date.isoformat(),
            "source": order.source,
        },
    )
    return portal_service.order_out(db, order)


@router.post("/orders/{order_id}/cancel", response_model=schemas.PortalOrderOut)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    account: PartyAccount = Depends(current_party),
):
    """Withdraw an order, allowed only before a truck has collected it."""
    order = portal_service.find_my_order(db, account, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == OrderStatus.CANCELLED.value:
        return portal_service.order_out(db, order)
    if order.picked_up_at is not None:
        raise HTTPException(
            status_code=422,
            detail="This consignment has already been collected. Call the control room.",
        )
    if order.truck_id is not None:
        raise HTTPException(
            status_code=422,
            detail=(
                "A truck has already been allocated. Call the control room to "
                "cancel this order."
            ),
        )

    order.status = OrderStatus.CANCELLED.value
    db.commit()
    db.refresh(order)
    return portal_service.order_out(db, order)
