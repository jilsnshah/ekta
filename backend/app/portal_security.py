"""Authentication for the billing-party portal.

Parties sign in with a mobile number and a one-time code. The account is
created on first successful verification, so there is no separate sign-up.

SECURITY NOTE: the OTP is currently a fixed development code -- see
``Settings.portal_otp_fixed``. Until that is replaced with per-request codes
delivered over SMS, this login is not safe for real users.
"""
from __future__ import annotations

import re
from datetime import timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from .clock import utcnow
from .config import get_settings
from .database import get_db
from .models import Company, PartyAccount

settings = get_settings()

# Separate scheme instance so the portal's 401s do not point at the admin
# login form.
portal_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/portal/auth/verify", auto_error=False
)

PARTY_ROLE = "party"


def normalise_phone(raw: str) -> str:
    """Reduce a typed number to digits so one party is one account.

    Indian mobile numbers are accepted with or without the country code, and
    with any spacing or punctuation. The last 10 digits are the identity.
    """
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) > 10:
        digits = digits[-10:]
    if len(digits) != 10:
        raise ValueError("Enter a 10-digit mobile number")
    return digits


def display_phone(phone: str) -> str:
    return f"+91 {phone[:5]} {phone[5:]}" if len(phone) == 10 else phone


def verify_otp(code: str) -> bool:
    """Check a submitted code against the configured one.

    Returns False when no fixed code is configured, which disables this login
    path rather than letting anything through.
    """
    expected = (settings.portal_otp_fixed or "").strip()
    if not expected:
        return False
    return (code or "").strip() == expected


def create_party_token(account: PartyAccount) -> str:
    expire = utcnow() + timedelta(minutes=settings.portal_token_ttl_minutes)
    payload = {
        "sub": account.phone,
        "role": PARTY_ROLE,
        "account_id": account.id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def current_party(
    token: Optional[str] = Depends(portal_scheme),
    db: Session = Depends(get_db),
) -> PartyAccount:
    """The signed-in billing party, or 401.

    Rejects admin and driver tokens outright: the portal is a separate
    audience and must not accept a staff token.
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not signed in",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_error
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        raise credentials_error

    # A staff or driver-app token must never satisfy a portal dependency.
    if payload.get("role") != PARTY_ROLE:
        raise credentials_error

    account_id = payload.get("account_id")
    if not isinstance(account_id, int):
        raise credentials_error

    account = db.get(PartyAccount, account_id)
    if account is None or not account.is_active:
        raise credentials_error
    # The token carries the number it was issued for; a changed account must
    # not keep an old token alive.
    if account.phone != payload.get("sub"):
        raise credentials_error
    return account


def owned_company(db: Session, account: PartyAccount, company_id: int) -> Company:
    """Fetch one of *this* account's companies, or 404.

    A company belonging to someone else is reported as missing rather than
    forbidden, so the portal never confirms that an id exists.
    """
    company = db.scalar(
        select(Company)
        .where(Company.id == company_id)
        .where(Company.account_id == account.id)
    )
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return company
