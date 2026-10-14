from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..database import get_db
from ..pagination import Page, PageParams, as_page, paginate
from ..models import Driver, DriverStatus, Trip, TripStatus, Truck
from ..security import current_user, require_admin

router = APIRouter(prefix="/api/drivers", tags=["drivers"])


def _get_driver(db: Session, driver_id: int) -> Driver:
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    return driver


def _next_code(db: Session) -> str:
    count = db.scalar(select(func.count(Driver.id))) or 0
    return f"DRV-{count + 1:04d}"


DRIVER_SORTS = {
    "name": Driver.name,
    "code": Driver.code,
    "status": Driver.status,
    "home_city": Driver.home_city,
}


@router.get("", response_model=Page[schemas.DriverOut])
def list_drivers(
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    page: PageParams = Depends(),
    status: Optional[List[str]] = Query(default=None),
    search: Optional[str] = None,
    unassigned: bool = False,
    sort: str = Query("name"),
    descending: bool = False,
):
    column = DRIVER_SORTS.get(sort, Driver.name)
    stmt = select(Driver).order_by(
        column.desc() if descending else column.asc(), Driver.id
    )

    if status:
        stmt = stmt.where(Driver.status.in_(status))
    if unassigned:
        # "No truck holds this driver", expressed in SQL so it survives paging.
        stmt = stmt.where(
            ~select(Truck.id)
            .where(Truck.driver_id == Driver.id)
            .correlate(Driver)
            .exists()
        )
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Driver.name.ilike(term),
                Driver.phone.ilike(term),
                Driver.code.ilike(term),
                Driver.license_number.ilike(term),
                Driver.home_city.ilike(term),
            )
        )

    rows, total = paginate(db, stmt, page)
    return as_page([serializers.driver_out(db, d) for d in rows], total, page)


@router.get("/stats", response_model=schemas.DriverStats)
def driver_stats(db: Session = Depends(get_db), _user=Depends(current_user)):
    """Fleet-wide driver counts for the filter chips.

    Counted in SQL rather than in the browser: the page on screen holds 25 of
    them, so tallying what has been fetched would label every chip wrongly.
    """
    by_status = {
        status.value: 0 for status in DriverStatus
    }
    rows = db.execute(
        select(Driver.status, func.count(Driver.id)).group_by(Driver.status)
    ).all()
    for status, count in rows:
        key = status.value if hasattr(status, "value") else str(status)
        by_status[key] = int(count)

    without_truck = int(
        db.scalar(
            select(func.count(Driver.id)).where(
                ~select(Truck.id)
                .where(Truck.driver_id == Driver.id)
                .correlate(Driver)
                .exists()
            )
        )
        or 0
    )
    return schemas.DriverStats(
        total=sum(by_status.values()),
        by_status=by_status,
        without_truck=without_truck,
    )


@router.get("/{driver_id}", response_model=schemas.DriverOut)
def get_driver(
    driver_id: int, db: Session = Depends(get_db), _user=Depends(current_user)
):
    return serializers.driver_out(db, _get_driver(db, driver_id))


@router.post("", response_model=schemas.DriverOut, status_code=201)
def create_driver(
    payload: schemas.DriverCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    if db.scalar(
        select(Driver).where(Driver.license_number == payload.license_number.strip())
    ):
        raise HTTPException(
            status_code=409,
            detail=f"License {payload.license_number} is already on file",
        )
    driver = Driver(code=_next_code(db), **payload.model_dump())
    driver.license_number = driver.license_number.strip()
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return serializers.driver_out(db, driver)


@router.patch("/{driver_id}", response_model=schemas.DriverOut)
def update_driver(
    driver_id: int,
    payload: schemas.DriverUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    driver = _get_driver(db, driver_id)
    data = payload.model_dump(exclude_unset=True)

    if data.get("license_number"):
        clash = db.scalar(
            select(Driver)
            .where(Driver.license_number == data["license_number"].strip())
            .where(Driver.id != driver.id)
        )
        if clash:
            raise HTTPException(
                status_code=409, detail="That license number belongs to another driver"
            )

    if data.get("status") and data["status"] not in [s.value for s in DriverStatus]:
        raise HTTPException(status_code=422, detail="Unknown driver status")

    for key, value in data.items():
        setattr(driver, key, value)
    db.commit()
    db.refresh(driver)
    return serializers.driver_out(db, driver)


@router.post("/{driver_id}/assign-truck/{truck_id}", response_model=schemas.DriverOut)
def assign_truck(
    driver_id: int,
    truck_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Move a driver onto a truck, enforcing the 1:1 rule in both directions."""
    driver = _get_driver(db, driver_id)
    truck = db.get(Truck, truck_id)
    if truck is None:
        raise HTTPException(status_code=404, detail="Truck not found")

    other = db.scalar(
        select(Truck).where(Truck.driver_id == driver.id).where(Truck.id != truck.id)
    )
    if other is not None:
        active = db.scalar(
            select(Trip)
            .where(Trip.truck_id == other.id)
            .where(Trip.status == TripStatus.IN_PROGRESS.value)
        )
        if active is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{driver.name} is driving {other.registration_number} on active "
                    f"trip {active.code} and cannot be reassigned now."
                ),
            )
        other.driver_id = None

    if truck.driver_id is not None and truck.driver_id != driver.id:
        previous = db.get(Driver, truck.driver_id)
        if previous is not None:
            previous.status = DriverStatus.AVAILABLE.value

    truck.driver_id = driver.id
    db.commit()
    db.refresh(driver)
    return serializers.driver_out(db, driver)


@router.delete("/{driver_id}/assign-truck", response_model=schemas.DriverOut)
def unassign_truck(
    driver_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)
):
    driver = _get_driver(db, driver_id)
    truck = driver.truck
    if truck is not None:
        active = db.scalar(
            select(Trip)
            .where(Trip.truck_id == truck.id)
            .where(Trip.status == TripStatus.IN_PROGRESS.value)
        )
        if active is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot unassign while trip {active.code} is in progress",
            )
        truck.driver_id = None
    db.commit()
    db.refresh(driver)
    return serializers.driver_out(db, driver)


@router.get("/{driver_id}/trips", response_model=Page[schemas.TripBrief])
def driver_trips(
    driver_id: int,
    db: Session = Depends(get_db),
    _user=Depends(current_user),
    page: PageParams = Depends(),
):
    _get_driver(db, driver_id)
    stmt = (
        select(Trip)
        .where(Trip.driver_id == driver_id)
        .order_by(Trip.created_at.desc(), Trip.id.desc())
    )
    rows, total = paginate(db, stmt, page)
    return as_page([serializers.trip_brief(t) for t in rows], total, page)
