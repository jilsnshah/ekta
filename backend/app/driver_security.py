"""Authentication for the driver app.

A driver signs in with the mobile number already on their fleet record. Unlike
the billing-party portal, this never creates an account: a driver exists only
because the control room added them, so an unknown number is refused.

SECURITY NOTE: the OTP is the same fixed development code as the party portal
-- see ``Settings.portal_otp_fixed``. Until that is replaced with per-request
codes delivered over SMS, this login is not safe for real use.
"""
from __future__ import annotations

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
from .models import Driver
from .portal_security import normalise_phone  # one phone format across the app

settings = get_settings()

driver_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/driver/auth/verify", auto_error=False
)

#: Distinct from the staff "driver" user role, which is an email/password login.
DRIVER_APP_ROLE = "driver_app"


def find_driver_by_phone(db: Session, phone: str) -> Optional[Driver]:
    """Match a typed number against the fleet's driver records.

    Stored numbers are free text entered by the control room ("+91 98765
    43210", "9876543210"), so both sides are reduced to ten digits before
    comparing rather than matching the string.
    """
    for driver in db.scalars(select(Driver)):
        try:
            if normalise_phone(driver.phone) == phone:
                return driver
        except ValueError:
            # A record with an unusable number simply cannot sign in.
            continue
    return None


def create_driver_token(driver: Driver) -> str:
    expire = utcnow() + timedelta(minutes=settings.portal_token_ttl_minutes)
    payload = {
        "sub": driver.code,
        "role": DRIVER_APP_ROLE,
        "driver_id": driver.id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def current_driver(
    token: Optional[str] = Depends(driver_scheme),
    db: Session = Depends(get_db),
) -> Driver:
    """The signed-in driver, or 401.

    Rejects staff and billing-party tokens: the driver app is its own
    audience.
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

    if payload.get("role") != DRIVER_APP_ROLE:
        raise credentials_error

    driver_id = payload.get("driver_id")
    if not isinstance(driver_id, int):
        raise credentials_error

    driver = db.get(Driver, driver_id)
    if driver is None or driver.code != payload.get("sub"):
        raise credentials_error
    return driver
