"""Server-side pagination.

Every list endpoint returns a page, never the whole table. Filtering, searching
and sorting all happen in SQL for the same reason: narrowing a single page in
the browser would silently search only that page, which is wrong the moment
the data outgrows one.

Usage in a router::

    @router.get("", response_model=Page[schemas.OrderOut])
    def list_orders(page: PageParams = Depends(), ...):
        stmt = select(TransportOrder).order_by(...)
        rows, total = paginate(db, stmt, page)
        return as_page([serialise(r) for r in rows], total, page)
"""
from __future__ import annotations

from math import ceil
from typing import Generic, List, Sequence, Tuple, TypeVar

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

T = TypeVar("T")

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 200


class PageParams:
    """Shared `?page=&page_size=` query parameters.

    ``page_size`` is capped so a caller cannot ask for the whole table and
    undo the point of paginating.
    """

    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-based page number"),
        page_size: int = Query(
            DEFAULT_PAGE_SIZE,
            ge=1,
            le=MAX_PAGE_SIZE,
            description=f"Rows per page, at most {MAX_PAGE_SIZE}",
        ),
    ) -> None:
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class Page(BaseModel, Generic[T]):
    """One page of results, plus what the caller needs to page through."""

    items: List[T]
    total: int
    page: int
    page_size: int
    pages: int
    has_next: bool
    has_previous: bool


def paginate(
    db: Session, stmt: Select, params: PageParams
) -> Tuple[List, int]:
    """Run ``stmt`` for one page, and count the whole thing.

    The count drops the ORDER BY: sorting a count is wasted work, and some
    databases reject it alongside DISTINCT.
    """
    total = (
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
        or 0
    )
    rows = list(
        db.scalars(stmt.limit(params.page_size).offset(params.offset))
    )
    return rows, int(total)


def as_page(items: Sequence[T], total: int, params: PageParams) -> dict:
    """Wrap already-serialised items in the page envelope."""
    pages = max(ceil(total / params.page_size), 1) if total else 0
    return {
        "items": list(items),
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "pages": pages,
        "has_next": params.page * params.page_size < total,
        "has_previous": params.page > 1,
    }


def empty_page(params: PageParams) -> dict:
    return as_page([], 0, params)
