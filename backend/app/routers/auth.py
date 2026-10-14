from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models import User
from ..security import authenticate, create_access_token, current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = authenticate(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token = create_access_token(user.email, user.role, user.driver_id)
    return schemas.TokenResponse(
        access_token=token,
        role=user.role,
        full_name=user.full_name,
        email=user.email,
        driver_id=user.driver_id,
    )


@router.get("/me", response_model=schemas.UserOut)
def me(user: User = Depends(current_user)):
    return schemas.UserOut.model_validate(user)
