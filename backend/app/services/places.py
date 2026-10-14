"""The shared address book.

A godown is typed once and offered back from then on. Entries belong either to
a billing-party account or, when ``account_id`` is None, to the control room.

Nothing here is maintained by hand: ``remember`` is called whenever an order
is raised, so the book is a by-product of ordinary use.
"""
from __future__ import annotations

import re
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..clock import utcnow
from ..models import SavedPlace


def match_key(label: str, address: str) -> str:
    """Identity of a place, tolerant of how it was typed.

    Case, punctuation and repeated whitespace are all ignored, so "Plot 9,
    Sanand GIDC" and "plot 9  sanand gidc" are the same entry rather than two.
    """
    raw = f"{label}|{address}".lower()
    return re.sub(r"[^a-z0-9|]+", " ", raw).strip()[:320]


def remember(
    db: Session,
    label: str,
    phone: Optional[str],
    address: str,
    account_id: Optional[int] = None,
) -> SavedPlace:
    """Save a place, or bump the one that already matches.

    Returns the entry either way. The caller is expected to commit.
    """
    label = (label or "").strip()
    address = (address or "").strip()
    key = match_key(label, address)

    existing = db.scalar(
        select(SavedPlace)
        .where(SavedPlace.account_id == account_id)
        .where(SavedPlace.match_key == key)
    )
    if existing is not None:
        existing.use_count += 1
        existing.last_used_at = utcnow()
        # A number added later should stick, but never blank out a known one.
        if phone and not existing.phone:
            existing.phone = phone.strip()
        return existing

    place = SavedPlace(
        account_id=account_id,
        label=label,
        phone=(phone or "").strip() or None,
        address=address,
        match_key=key,
        use_count=1,
        last_used_at=utcnow(),
    )
    db.add(place)
    # The session runs with autoflush off, so without this the lookup above
    # would not see rows added earlier in the same transaction and every call
    # would insert a duplicate.
    db.flush()
    return place


def for_account(db: Session, account_id: Optional[int]) -> List[SavedPlace]:
    """One owner's book, most-used first so the usual suspects lead."""
    return list(
        db.scalars(
            select(SavedPlace)
            .where(SavedPlace.account_id == account_id)
            .order_by(SavedPlace.use_count.desc(), SavedPlace.label)
        )
    )


def owned(db: Session, place_id: int, account_id: Optional[int]) -> Optional[SavedPlace]:
    """One of *this* owner's entries, or None.

    Another owner's id reads as missing rather than forbidden.
    """
    return db.scalar(
        select(SavedPlace)
        .where(SavedPlace.id == place_id)
        .where(SavedPlace.account_id == account_id)
    )


def out(place: SavedPlace, owner: Optional[str] = None) -> schemas.SavedPlaceOut:
    return schemas.SavedPlaceOut(
        id=place.id,
        label=place.label,
        phone=place.phone,
        address=place.address,
        use_count=place.use_count,
        last_used_at=place.last_used_at,
        owner=owner,
    )
