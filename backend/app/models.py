from __future__ import annotations

import enum
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


# --------------------------------------------------------------------------- #
# Enumerations (stored as short strings so the schema stays portable between
# SQLite and PostgreSQL without native ENUM migrations).
# --------------------------------------------------------------------------- #
class TruckStatus(str, enum.Enum):
    AVAILABLE = "available"
    ASSIGNED = "assigned"
    IN_TRANSIT = "in_transit"
    AT_PICKUP = "at_pickup"
    AT_DELIVERY = "at_delivery"
    DELAYED = "delayed"
    MAINTENANCE = "maintenance"


# Statuses the operator sets by hand. The rest are driven by the assignment
# and trip lifecycle.
OPERATOR_SETTABLE_TRUCK_STATUSES = (
    TruckStatus.AVAILABLE,
    TruckStatus.AT_PICKUP,
    TruckStatus.AT_DELIVERY,
    TruckStatus.DELAYED,
    TruckStatus.MAINTENANCE,
)


class DriverStatus(str, enum.Enum):
    AVAILABLE = "available"
    ON_TRIP = "on_trip"
    RESTING = "resting"
    UNAVAILABLE = "unavailable"


class OrderStatus(str, enum.Enum):
    NEW = "new"
    UNASSIGNED = "unassigned"
    ASSIGNED = "assigned"
    PICKUP_PENDING = "pickup_pending"
    PICKED_UP = "picked_up"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


# Statuses that still occupy space on a truck.
LOAD_BEARING_ORDER_STATUSES = (
    OrderStatus.ASSIGNED,
    OrderStatus.PICKUP_PENDING,
    OrderStatus.PICKED_UP,
    OrderStatus.IN_TRANSIT,
)

OPEN_ORDER_STATUSES = (OrderStatus.NEW, OrderStatus.UNASSIGNED)


class TripStatus(str, enum.Enum):
    PLANNED = "planned"
    DISPATCHED = "dispatched"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class StopType(str, enum.Enum):
    PICKUP = "pickup"
    DELIVERY = "delivery"


class StopStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class AlertKind(str, enum.Enum):
    CAPACITY_EXCEEDED = "capacity_exceeded"
    TRUCK_DELAYED = "truck_delayed"
    DRIVER_REPORTED_DELAY = "driver_reported_delay"
    PICKUP_OVERDUE = "pickup_overdue"
    TRUCK_WITHOUT_DRIVER = "truck_without_driver"
    ORDER_UNASSIGNED_TOO_LONG = "order_unassigned_too_long"


class AlertSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    DRIVER = "driver"


class OrderSource(str, enum.Enum):
    """Who raised the order."""

    ADMIN = "admin"
    PORTAL = "portal"


# --------------------------------------------------------------------------- #
# Association: a single trip stop can serve several orders (e.g. two pickups
# from the same warehouse are collapsed into one stop).
# --------------------------------------------------------------------------- #
trip_stop_orders = Table(
    "trip_stop_orders",
    Base.metadata,
    Column("trip_stop_id", ForeignKey("trip_stops.id", ondelete="CASCADE"), primary_key=True),
    Column("order_id", ForeignKey("transport_orders.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(160), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default=UserRole.ADMIN.value)
    driver_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    driver: Mapped[Optional["Driver"]] = relationship(back_populates="user")


class PartyAccount(Base):
    """A billing party's own login, identified by mobile number.

    Accounts are created on first successful OTP verification; there is no
    separate sign-up step.
    """

    __tablename__ = "party_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    companies: Mapped[List["Company"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class Company(Base):
    """One of the companies a party account places orders for."""

    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("party_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    gst_number: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    contact_person: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    account: Mapped["PartyAccount"] = relationship(back_populates="companies")

    __table_args__ = (
        UniqueConstraint("account_id", "name", name="uq_company_account_name"),
    )


class SavedPlace(Base):
    """An address book entry: a godown, factory gate or yard used repeatedly.

    ``account_id`` is the owner. A billing party's places are private to that
    party; a row with no account is a control-room entry, shared by the staff
    who raise orders on the phone.

    Entries are created automatically the first time an address is typed on an
    order, so the book fills itself without anyone maintaining it.
    """

    __tablename__ = "saved_places"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("party_accounts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    #: What the user calls the place; becomes the order's pickup/drop name.
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    #: Normalised label+address, so the same place is not saved twice.
    match_key: Mapped[str] = mapped_column(String(320), nullable=False, index=True)

    use_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    account: Mapped[Optional["PartyAccount"]] = relationship()

    __table_args__ = (
        UniqueConstraint("account_id", "match_key", name="uq_place_owner_match"),
    )


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(24), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    license_number: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    license_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=DriverStatus.AVAILABLE.value, index=True
    )
    home_city: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    #: Set when the driver signs in to the driver app.
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Driver 1 --- 1 Truck. The uniqueness of Truck.driver_id guarantees a
    # driver is never attached to two trucks at once.
    truck: Mapped[Optional["Truck"]] = relationship(
        back_populates="driver", uselist=False, foreign_keys="Truck.driver_id"
    )
    trips: Mapped[List["Trip"]] = relationship(back_populates="driver")
    user: Mapped[Optional["User"]] = relationship(back_populates="driver")


class Truck(Base):
    __tablename__ = "trucks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    registration_number: Mapped[str] = mapped_column(
        String(24), unique=True, nullable=False, index=True
    )
    capacity_tons: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=TruckStatus.AVAILABLE.value, index=True
    )

    # Driver 1 --- 1 Truck, enforced by the unique constraint below.
    driver_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True, unique=True
    )

    # Where the truck is based. A depot, not a live position.
    base_city: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)

    # Vehicle details
    make: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    axles: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    body_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    fuel_type: Mapped[Optional[str]] = mapped_column(String(24), nullable=True, default="Diesel")
    odometer_km: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    insurance_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    fitness_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_service_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    current_trip_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("trips.id", ondelete="SET NULL", use_alter=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    driver: Mapped[Optional["Driver"]] = relationship(
        back_populates="truck", foreign_keys=[driver_id]
    )
    orders: Mapped[List["TransportOrder"]] = relationship(
        back_populates="truck", foreign_keys="TransportOrder.truck_id"
    )
    trips: Mapped[List["Trip"]] = relationship(
        back_populates="truck", foreign_keys="Trip.truck_id"
    )
    current_trip: Mapped[Optional["Trip"]] = relationship(
        foreign_keys=[current_trip_id], post_update=True
    )

    __table_args__ = (
        CheckConstraint("capacity_tons > 0", name="ck_truck_capacity_positive"),
    )


class TransportOrder(Base):
    """A consignment to move.

    The billing party and both addresses are free text typed by the operator
    rather than foreign keys, because dispatch takes orders over the phone for
    sites that are not on any master list.
    """

    __tablename__ = "transport_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # System reference, always present.
    code: Mapped[str] = mapped_column(String(24), unique=True, nullable=False, index=True)
    # The party's own order number, if they quoted one.
    order_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    # The party's display name. For a portal order this is copied from the
    # chosen company, so the admin view reads the same either way.
    billing_party: Mapped[str] = mapped_column(String(160), nullable=False, index=True)

    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default=OrderSource.ADMIN.value, index=True
    )
    company_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True
    )
    placed_by_account_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("party_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )

    material: Mapped[str] = mapped_column(String(120), nullable=False)
    # Weight is always in tons; it is what every capacity check uses.
    quantity_tons: Mapped[float] = mapped_column(Float, nullable=False)

    pickup_name: Mapped[str] = mapped_column(String(160), nullable=False)
    pickup_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    pickup_address: Mapped[str] = mapped_column(Text, nullable=False)

    drop_name: Mapped[str] = mapped_column(String(160), nullable=False)
    drop_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    drop_address: Mapped[str] = mapped_column(Text, nullable=False)

    # A day, not a timestamp: dispatch works to dates, not clock times.
    pickup_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    special_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=OrderStatus.UNASSIGNED.value, index=True
    )

    truck_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("trucks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    trip_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("trips.id", ondelete="SET NULL"), nullable=True, index=True
    )

    assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    picked_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    truck: Mapped[Optional["Truck"]] = relationship(
        back_populates="orders", foreign_keys=[truck_id]
    )
    trip: Mapped[Optional["Trip"]] = relationship(
        back_populates="orders", foreign_keys=[trip_id]
    )
    company: Mapped[Optional["Company"]] = relationship()
    placed_by: Mapped[Optional["PartyAccount"]] = relationship()

    __table_args__ = (
        CheckConstraint("quantity_tons > 0", name="ck_order_qty_positive"),
        Index("ix_order_truck_status", "truck_id", "status"),
    )


class Trip(Base):
    """A truck's run: the orders it carries and the stops it must make."""

    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)

    truck_id: Mapped[int] = mapped_column(
        ForeignKey("trucks.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    driver_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True, index=True
    )

    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=TripStatus.PLANNED.value, index=True
    )
    total_cargo_tons: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # Share of stops completed. The operator advances this by closing stops.
    progress_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    truck: Mapped["Truck"] = relationship(back_populates="trips", foreign_keys=[truck_id])
    driver: Mapped[Optional["Driver"]] = relationship(back_populates="trips")
    orders: Mapped[List["TransportOrder"]] = relationship(
        back_populates="trip", foreign_keys="TransportOrder.trip_id"
    )
    stops: Mapped[List["TripStop"]] = relationship(
        back_populates="trip",
        cascade="all, delete-orphan",
        order_by="TripStop.sequence",
    )


class TripStop(Base):
    """One physical visit on a trip.

    The place is copied onto the stop when the trip is planned, so a later
    edit to the order cannot rewrite the history of where the driver went.
    """

    __tablename__ = "trip_stops"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_id: Mapped[int] = mapped_column(
        ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    stop_type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=StopStatus.PENDING.value
    )

    place_name: Mapped[str] = mapped_column(String(160), nullable=False)
    place_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    place_address: Mapped[str] = mapped_column(Text, nullable=False)

    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    trip: Mapped["Trip"] = relationship(back_populates="stops")
    orders: Mapped[List["TransportOrder"]] = relationship(secondary=trip_stop_orders)

    __table_args__ = (
        UniqueConstraint("trip_id", "sequence", name="uq_trip_stop_sequence"),
    )


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(
        String(16), nullable=False, default=AlertSeverity.WARNING.value
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    truck_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("trucks.id", ondelete="CASCADE"), nullable=True
    )
    order_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("transport_orders.id", ondelete="CASCADE"), nullable=True
    )
    trip_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("trips.id", ondelete="CASCADE"), nullable=True
    )
    driver_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("drivers.id", ondelete="CASCADE"), nullable=True
    )
    # Stable key so the same condition is not re-raised every scan.
    dedupe_key: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), index=True
    )

    truck: Mapped[Optional["Truck"]] = relationship()
    order: Mapped[Optional["TransportOrder"]] = relationship()
    trip: Mapped[Optional["Trip"]] = relationship()
    driver: Mapped[Optional["Driver"]] = relationship()

    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_alert_dedupe"),
    )
