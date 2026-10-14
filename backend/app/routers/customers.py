"""Customers, for the control room.

Every billing-party account and its companies, whether the customer signed up
in the portal or the control room added them over the phone. The control room
can add a customer and their companies ahead of the customer ever signing in;
when they do sign in with that number, it is the same account.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models import Company, PartyAccount, TransportOrder
from ..pagination import Page, PageParams, as_page, paginate
from ..security import current_user, require_admin
from ..services import customers as customer_service

router = APIRouter(prefix="/api/customers", tags=["customers"])


def _get(db: Session, customer_id: int) -> PartyAccount:
    account = db.get(PartyAccount, customer_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return account


def _phone_term(search: str) -> Optional[str]:
    """Digits of a search that looks like a phone number, for matching."""
    digits = "".join(ch for ch in search if ch.isdigit())
    return digits if len(digits) >= 3 else None


@router.get("", response_model=Page[schemas.CustomerOut])
def list_customers(
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    page: PageParams = Depends(),
    search: Optional[str] = None,
    signed_in: Optional[bool] = None,
):
    """Every customer, most recently active first.

    Search matches the person, the number or any of their companies, in SQL.
    ``signed_in=false`` finds the ones the control room added who have never
    opened the portal.
    """
    last_order = (
        select(func.max(TransportOrder.created_at))
        .where(customer_service.orders_of(PartyAccount.id))
        .correlate(PartyAccount)
        .scalar_subquery()
    )
    stmt = select(PartyAccount).order_by(
        func.coalesce(last_order, PartyAccount.created_at).desc(), PartyAccount.id.desc()
    )

    if search:
        term = f"%{search.strip()}%"
        conditions = [
            PartyAccount.full_name.ilike(term),
            PartyAccount.id.in_(select(Company.account_id).where(Company.name.ilike(term))),
            PartyAccount.id.in_(
                select(Company.account_id).where(Company.gst_number.ilike(term))
            ),
        ]
        digits = _phone_term(search)
        if digits:
            conditions.append(PartyAccount.phone.ilike(f"%{digits}%"))
        stmt = stmt.where(or_(*conditions))

    if signed_in is True:
        stmt = stmt.where(PartyAccount.last_login_at.is_not(None))
    elif signed_in is False:
        stmt = stmt.where(PartyAccount.last_login_at.is_(None))

    rows, total = paginate(db, stmt, page)
    return as_page([customer_service.customer_out(db, a) for a in rows], total, page)


@router.get("/lookup", response_model=Optional[schemas.CustomerDetail])
def lookup_by_phone(
    phone: str = Query(..., min_length=6),
    db: Session = Depends(get_db),
    _user=Depends(current_user),
):
    """The customer with this number, or null.

    What the order form calls as the operator types a number: an existing
    customer comes back with their companies, ready to pick from.
    """
    account = customer_service.find_by_phone(db, phone)
    if account is None:
        return None
    return _detail(db, account)


@router.get("/companies", response_model=Page[schemas.CompanyAdminOut])
def list_companies(
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    page: PageParams = Depends(),
    search: Optional[str] = None,
):
    """Every customer's companies, for picking who an order is billed to."""
    stmt = (
        select(Company)
        .join(PartyAccount, Company.account_id == PartyAccount.id)
        .order_by(Company.name, Company.id)
    )
    if search:
        term = f"%{search.strip()}%"
        conditions = [
            Company.name.ilike(term),
            Company.gst_number.ilike(term),
            Company.contact_person.ilike(term),
            PartyAccount.full_name.ilike(term),
        ]
        digits = _phone_term(search)
        if digits:
            conditions.append(PartyAccount.phone.ilike(f"%{digits}%"))
        stmt = stmt.where(or_(*conditions))

    rows, total = paginate(db, stmt, page)
    return as_page([customer_service.company_admin_out(db, c) for c in rows], total, page)


def _detail(db: Session, account: PartyAccount) -> schemas.CustomerDetail:
    companies = db.scalars(
        select(Company).where(Company.account_id == account.id).order_by(Company.name)
    )
    return schemas.CustomerDetail(
        **customer_service.customer_out(db, account).model_dump(),
        companies=[customer_service.company_admin_out(db, c) for c in companies],
    )


@router.post("", response_model=schemas.CustomerDetail, status_code=201)
def create_customer(
    payload: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Add a customer before they have ever signed in.

    When they later sign in to the portal with this number, this is the
    account they get -- with everything already raised for them.
    """
    account = customer_service.create_account(db, payload.phone, payload.full_name)
    if payload.company is not None:
        customer_service.add_company(db, account, payload.company)
    db.commit()
    db.refresh(account)
    return _detail(db, account)


@router.get("/{customer_id}", response_model=schemas.CustomerDetail)
def get_customer(
    customer_id: int, db: Session = Depends(get_db), _user=Depends(current_user)
):
    return _detail(db, _get(db, customer_id))


@router.patch("/{customer_id}", response_model=schemas.CustomerDetail)
def update_customer(
    customer_id: int,
    payload: schemas.CustomerUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    account = _get(db, customer_id)
    data = payload.model_dump(exclude_unset=True)
    if "full_name" in data:
        account.full_name = (data["full_name"] or "").strip() or None
    if "is_active" in data and data["is_active"] is not None:
        account.is_active = data["is_active"]
    db.commit()
    db.refresh(account)
    return _detail(db, account)


@router.post(
    "/{customer_id}/companies", response_model=schemas.CompanyAdminOut, status_code=201
)
def add_company(
    customer_id: int,
    payload: schemas.CompanyCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    account = _get(db, customer_id)
    company = customer_service.add_company(db, account, payload)
    db.commit()
    db.refresh(company)
    return customer_service.company_admin_out(db, company)


@router.patch("/companies/{company_id}", response_model=schemas.CompanyAdminOut)
def update_company(
    company_id: int,
    payload: schemas.CompanyUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Correct a company's details. Past orders keep the name they were billed under."""
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")

    data = payload.model_dump(exclude_unset=True)
    if data.get("name"):
        name = data["name"].strip()
        clash = db.scalar(
            select(Company)
            .where(Company.account_id == company.account_id)
            .where(Company.id != company.id)
            .where(func.lower(Company.name) == name.lower())
        )
        if clash is not None:
            raise HTTPException(
                status_code=409, detail=f"“{clash.name}” is already on this account"
            )
        company.name = name
    for key in ("gst_number", "contact_person", "address"):
        if key in data:
            setattr(company, key, (data[key] or "").strip() or None)
    db.commit()
    db.refresh(company)
    return customer_service.company_admin_out(db, company)

