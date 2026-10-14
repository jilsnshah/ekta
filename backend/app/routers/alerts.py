from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..database import get_db
from ..pagination import Page, PageParams, as_page, paginate
from ..models import Alert
from ..security import current_user, require_admin
from ..services import alerts as alert_service

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=Page[schemas.AlertOut])
def list_alerts(
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    page: PageParams = Depends(),
    severity: Optional[List[str]] = Query(default=None),
    kind: Optional[List[str]] = Query(default=None),
    acknowledged: Optional[bool] = None,
    search: Optional[str] = None,
):
    stmt = select(Alert).order_by(Alert.created_at.desc(), Alert.id.desc())
    if severity:
        stmt = stmt.where(Alert.severity.in_(severity))
    if kind:
        stmt = stmt.where(Alert.kind.in_(kind))
    if acknowledged is not None:
        stmt = stmt.where(Alert.acknowledged.is_(acknowledged))
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(or_(Alert.title.ilike(term), Alert.message.ilike(term)))

    rows, total = paginate(db, stmt, page)
    return as_page([serializers.alert_out(a) for a in rows], total, page)


@router.get("/open-count", response_model=int)
def open_count(db: Session = Depends(get_db), _user=Depends(current_user)):
    """Just the badge number, so the nav never pulls a page of rows for it."""
    return int(
        db.scalar(select(func.count(Alert.id)).where(Alert.acknowledged.is_(False)))
        or 0
    )


@router.post("/scan", response_model=List[schemas.AlertOut])
def scan(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Force an immediate rules pass. A background task also runs this on a timer."""
    created = alert_service.scan(db)
    return [serializers.alert_out(a) for a in created]


@router.post("/{alert_id}/acknowledge", response_model=schemas.AlertOut)
def acknowledge(
    alert_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)
):
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged = True
    db.commit()
    db.refresh(alert)
    return serializers.alert_out(alert)


@router.post("/acknowledge-all", response_model=dict)
def acknowledge_all(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    rows = list(db.scalars(select(Alert).where(Alert.acknowledged.is_(False))))
    for alert in rows:
        alert.acknowledged = True
    db.commit()
    return {"acknowledged": len(rows)}
