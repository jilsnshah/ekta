"""Single source of 'now'.

All DateTime columns store naive UTC, so this returns a naive UTC datetime
rather than using the deprecated ``datetime.utcnow()``.
"""
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
