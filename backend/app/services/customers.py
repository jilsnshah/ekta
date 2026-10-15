"""Customers: the billing parties, whoever created them.

A customer is one ``PartyAccount``, identified by a mobile number. It may be
created by the customer signing in to the portal, or by the control room
raising an order for them over the phone -- either way it is the same row, so
when the customer later signs in with that number they find everything the
control room already did for them.

The one rule that ties it together lives here: an order belongs to a customer
when it is billed to one of their companies, or when they placed it
themselves. Who typed it in does not matter.
"""
from __future__ import annotations

from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import schemas
from ..models import (
    Company,
    OrderStatus,
    PartyAccount,
    SavedPlace,
    TransportOrder,
)
from ..portal_security import display_phone, normalise_phone


def orders_of(account_id: int):
    """SQL condition: the orders that belong to this customer."""
    return or_(
        TransportOrder.placed_by_account_id == account_id,
        TransportOrder.company_id.in_(
            select(Company.id).where(Company.account_id == account_id)
        ),
    )


def find_by_phone(db: Session, raw_phone: str) -> Optional[PartyAccount]:
    try:
        phone = normalise_phone(raw_phone)
    except ValueError:
        return None
    return db.scalar(select(PartyAccount).where(PartyAccount.phone == phone))


def create_account(db: Session, raw_phone: str, full_name: Optional[str]) -> PartyAccount:
    """A customer created by the control room, ahead of their first sign-in.

    The number is the identity, so a second account for the same number is
    refused -- and the existing one is named, so the caller can use it.
    """
    try:
        phone = normalise_phone(raw_phone)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    existing = db.scalar(select(PartyAccount).where(PartyAccount.phone == phone))
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    f"{display_phone(phone)} already belongs to "
                    f"{existing.full_name or 'a customer'}."
                ),
                "customer_id": existing.id,
            },
        )

    account = PartyAccount(phone=phone, full_name=(full_name or "").strip() or None)
    db.add(account)
    db.flush()
    return account


def add_company(
    db: Session, account: PartyAccount, payload: schemas.CompanyCreate
) -> Company:
    """Add a company to a customer, refusing a second one with the same name.

    Shared by the portal and the control room so both apply the same rule.
    """
    name = payload.name.strip()
    clash = db.scalar(
        select(Company)
        .where(Company.account_id == account.id)
        .where(func.lower(Company.name) == name.lower())
    )
    if clash is not None:
        raise HTTPException(
            status_code=409, detail=f"“{clash.name}” is already on this account"
        )

    company = Company(
        account_id=account.id,
        name=name,
        gst_number=(payload.gst_number or "").strip() or None,
        contact_person=(payload.contact_person or "").strip() or None,
        address=(payload.address or "").strip() or None,
    )
    db.add(company)
    db.flush()
    return company


def _owned_orders_union(ids: List[int]):
    """Every order belonging to any of `ids`, as (account_id, order_id, status, created_at).

    Two indexed branches rather than one OR-join: an order reaches a customer
    either through the company it is billed to or through whoever placed it.
    UNION rather than UNION ALL, so an order that satisfies both is counted
    once.

    Restricted to the ids on the page, which is the whole point -- the earlier
    version ordered by a correlated subquery, so Postgres evaluated it for
    every customer in the table (20,000 x 200,000 rows) before it could sort.
    """
    by_company = (
        select(
            Company.account_id.label("account_id"),
            TransportOrder.id.label("order_id"),
            TransportOrder.status.label("status"),
            TransportOrder.created_at.label("created_at"),
        )
        .join(Company, TransportOrder.company_id == Company.id)
        .where(Company.account_id.in_(ids))
    )
    by_placer = select(
        TransportOrder.placed_by_account_id.label("account_id"),
        TransportOrder.id.label("order_id"),
        TransportOrder.status.label("status"),
        TransportOrder.created_at.label("created_at"),
    ).where(TransportOrder.placed_by_account_id.in_(ids))
    return by_company.union(by_placer).subquery()


def customers_page(db: Session, stmt, params) -> Tuple[List[schemas.CustomerOut], int]:
    """A page of customers with their figures, in a handful of round trips.

    `stmt` selects PartyAccount rows and carries the filtering and ordering;
    it must order by indexed columns only. Every aggregate below is scoped to
    the ids actually on the page, so the cost follows the page size rather
    than the size of the table.
    """
    total = (
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    accounts = list(db.scalars(stmt.limit(params.page_size).offset(params.offset)))
    ids = [a.id for a in accounts]
    if not ids:
        return [], int(total)

    finished = [OrderStatus.DELIVERED.value, OrderStatus.CANCELLED.value]
    owned = _owned_orders_union(ids)
    order_stats = {
        row.account_id: (row.total, row.open_count, row.last_at)
        for row in db.execute(
            select(
                owned.c.account_id,
                func.count(owned.c.order_id).label("total"),
                func.count(owned.c.order_id)
                .filter(owned.c.status.notin_(finished))
                .label("open_count"),
                func.max(owned.c.created_at).label("last_at"),
            ).group_by(owned.c.account_id)
        ).all()
    }

    names: dict = {}
    for account_id, name in db.execute(
        select(Company.account_id, Company.name)
        .where(Company.account_id.in_(ids))
        .order_by(Company.name)
    ).all():
        names.setdefault(account_id, []).append(name)

    addresses = dict(
        db.execute(
            select(SavedPlace.account_id, func.count(SavedPlace.id))
            .where(SavedPlace.account_id.in_(ids))
            .group_by(SavedPlace.account_id)
        ).all()
    )

    items = []
    for account in accounts:
        total_orders, open_orders, last_at = order_stats.get(account.id, (0, 0, None))
        company_names = names.get(account.id, [])
        items.append(
            schemas.CustomerOut(
                id=account.id,
                phone=display_phone(account.phone),
                full_name=account.full_name,
                is_active=account.is_active,
                created_at=account.created_at,
                last_login_at=account.last_login_at,
                company_names=company_names,
                company_count=len(company_names),
                order_count=int(total_orders or 0),
                open_order_count=int(open_orders or 0),
                address_count=int(addresses.get(account.id, 0)),
                last_order_at=last_at,
            )
        )
    return items, int(total)


def customer_out(db: Session, account: PartyAccount) -> schemas.CustomerOut:
    """A customer with the counts the control room scans a list for.

    Each figure is its own small aggregate rather than a load of rows.
    """
    owned = orders_of(account.id)
    finished = [OrderStatus.DELIVERED.value, OrderStatus.CANCELLED.value]
    order_count = db.scalar(select(func.count(TransportOrder.id)).where(owned)) or 0
    open_count = (
        db.scalar(
            select(func.count(TransportOrder.id))
            .where(owned)
            .where(TransportOrder.status.notin_(finished))
        )
        or 0
    )
    last_order = db.scalar(select(func.max(TransportOrder.created_at)).where(owned))
    company_names = list(
        db.scalars(
            select(Company.name)
            .where(Company.account_id == account.id)
            .order_by(Company.name)
        )
    )
    address_count = (
        db.scalar(
            select(func.count(SavedPlace.id)).where(SavedPlace.account_id == account.id)
        )
        or 0
    )
    return schemas.CustomerOut(
        id=account.id,
        phone=display_phone(account.phone),
        full_name=account.full_name,
        is_active=account.is_active,
        created_at=account.created_at,
        last_login_at=account.last_login_at,
        company_names=company_names,
        company_count=len(company_names),
        order_count=int(order_count),
        open_order_count=int(open_count),
        address_count=int(address_count),
        last_order_at=last_order,
    )


def company_admin_out(db: Session, company: Company) -> schemas.CompanyAdminOut:
    count = (
        db.scalar(
            select(func.count(TransportOrder.id)).where(
                TransportOrder.company_id == company.id
            )
        )
        or 0
    )
    account = company.account
    return schemas.CompanyAdminOut(
        id=company.id,
        name=company.name,
        gst_number=company.gst_number,
        contact_person=company.contact_person,
        address=company.address,
        order_count=int(count),
        customer_id=account.id,
        customer_name=account.full_name,
        customer_phone=display_phone(account.phone),
    )
