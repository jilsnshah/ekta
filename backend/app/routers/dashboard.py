from __future__ import annotations

from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas, serializers
from ..clock import utcnow
from ..database import get_db
from ..models import (
    Alert,
    LOAD_BEARING_ORDER_STATUSES,
    OPEN_ORDER_STATUSES,
    OrderStatus,
    TransportOrder,
    Trip,
    TripStatus,
    Truck,
    TruckStatus,
)
from ..security import current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=schemas.DashboardOut)
def kpis(db: Session = Depends(get_db), _user=Depends(current_user)):
    now = utcnow()
    day_start = datetime.combine(now.date(), time.min)

    counts = dict(
        db.execute(
            select(Truck.status, func.count(Truck.id)).group_by(Truck.status)
        ).all()
    )

    def c(status: TruckStatus) -> int:
        return int(counts.get(status.value, 0))

    total_trucks = int(db.scalar(select(func.count(Truck.id))) or 0)
    total_capacity = float(db.scalar(select(func.sum(Truck.capacity_tons))) or 0.0)
    without_driver = int(
        db.scalar(select(func.count(Truck.id)).where(Truck.driver_id.is_(None))) or 0
    )

    load_values = [s.value for s in LOAD_BEARING_ORDER_STATUSES]
    total_load = float(
        db.scalar(
            select(func.sum(TransportOrder.quantity_tons))
            .where(TransportOrder.status.in_(load_values))
            .where(TransportOrder.truck_id.is_not(None))
        )
        or 0.0
    )

    active_trips = int(
        db.scalar(
            select(func.count(Trip.id)).where(
                Trip.status.in_(
                    [TripStatus.IN_PROGRESS.value, TripStatus.DISPATCHED.value]
                )
            )
        )
        or 0
    )

    order_counts = dict(
        db.execute(
            select(TransportOrder.status, func.count(TransportOrder.id)).group_by(
                TransportOrder.status
            )
        ).all()
    )

    def oc(*statuses: OrderStatus) -> int:
        return sum(int(order_counts.get(s.value, 0)) for s in statuses)

    today_total = int(
        db.scalar(
            select(func.count(TransportOrder.id)).where(
                TransportOrder.created_at >= day_start
            )
        )
        or 0
    )
    # No delivery deadline exists, so lateness is measured against the
    # collection date the operator entered.
    pickup_overdue = int(
        db.scalar(
            select(func.count(TransportOrder.id))
            .where(TransportOrder.pickup_date < now.date())
            .where(TransportOrder.picked_up_at.is_(None))
            .where(
                TransportOrder.status.not_in(
                    [OrderStatus.DELIVERED.value, OrderStatus.CANCELLED.value]
                )
            )
        )
        or 0
    )
    cargo_in_transit = float(
        db.scalar(
            select(func.sum(TransportOrder.quantity_tons)).where(
                TransportOrder.status.in_(
                    [OrderStatus.IN_TRANSIT.value, OrderStatus.PICKED_UP.value]
                )
            )
        )
        or 0.0
    )
    pending_tons = float(
        db.scalar(
            select(func.sum(TransportOrder.quantity_tons)).where(
                TransportOrder.status.in_([s.value for s in OPEN_ORDER_STATUSES])
            )
        )
        or 0.0
    )

    open_alerts = int(
        db.scalar(select(func.count(Alert.id)).where(Alert.acknowledged.is_(False)))
        or 0
    )

    return schemas.DashboardOut(
        fleet=schemas.FleetKpis(
            total_trucks=total_trucks,
            active_trips=active_trips,
            available=c(TruckStatus.AVAILABLE),
            assigned=c(TruckStatus.ASSIGNED),
            in_transit=c(TruckStatus.IN_TRANSIT),
            at_pickup=c(TruckStatus.AT_PICKUP),
            at_delivery=c(TruckStatus.AT_DELIVERY),
            delayed=c(TruckStatus.DELAYED),
            maintenance=c(TruckStatus.MAINTENANCE),
            without_driver=without_driver,
            total_capacity_tons=round(total_capacity, 2),
            total_load_tons=round(total_load, 2),
            fleet_utilisation_percent=(
                round(total_load / total_capacity * 100, 1) if total_capacity else 0.0
            ),
        ),
        orders=schemas.OrderKpis(
            total_today=today_total,
            pending=oc(OrderStatus.NEW, OrderStatus.UNASSIGNED),
            assigned=oc(OrderStatus.ASSIGNED, OrderStatus.PICKUP_PENDING),
            in_transit=oc(OrderStatus.IN_TRANSIT, OrderStatus.PICKED_UP),
            delivered=oc(OrderStatus.DELIVERED),
            pickup_overdue=pickup_overdue,
            cargo_in_transit_tons=round(cargo_in_transit, 2),
            pending_tons=round(pending_tons, 2),
            total_orders=int(db.scalar(select(func.count(TransportOrder.id))) or 0),
        ),
        alerts_open=open_alerts,
        generated_at=now,
    )


@router.get("/activity")
def activity(db: Session = Depends(get_db), _user=Depends(current_user)):
    """Recent operational events for the dashboard side rail."""
    since = utcnow() - timedelta(hours=24)
    recent_trips = list(
        db.scalars(
            select(Trip)
            .where(Trip.created_at >= since)
            .order_by(Trip.created_at.desc())
            .limit(12)
        )
    )
    recent_orders = list(
        db.scalars(
            select(TransportOrder).order_by(TransportOrder.created_at.desc()).limit(12)
        )
    )
    return {
        "trips": [serializers.trip_brief(t) for t in recent_trips],
        "orders": [serializers.order_brief(o) for o in recent_orders],
    }
