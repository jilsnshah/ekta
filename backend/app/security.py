from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import bcrypt
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from .clock import utcnow
from .config import get_settings
from .database import get_db
from .models import User, UserRole

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# bcrypt truncates at 72 bytes; truncate explicitly rather than let the
# library raise on long passphrases.
_MAX_PASSWORD_BYTES = 72


def _encode(raw: str) -> bytes:
    return raw.encode("utf-8")[:_MAX_PASSWORD_BYTES]


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(_encode(raw), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_encode(raw), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(subject: str, role: str, driver_id: Optional[int] = None) -> str:
    expire = utcnow() + timedelta(minutes=settings.access_token_ttl_minutes)
    payload = {"sub": subject, "role": role, "exp": expire}
    if driver_id is not None:
        payload["driver_id"] = driver_id
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def authenticate(db: Session, email: str, password: str) -> Optional[User]:
    user = db.scalar(select(User).where(User.email == email.lower().strip()))
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
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

    # A billing-party or driver-app token must never satisfy a staff
    # dependency: those are separate audiences with far narrower scope.
    if payload.get("role") not in (UserRole.ADMIN.value, UserRole.DRIVER.value):
        raise credentials_error

    email = payload.get("sub")
    if not email:
        raise credentials_error
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not user.is_active:
        raise credentials_error
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return user
