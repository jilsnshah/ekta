from __future__ import annotations

from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .pagination import Page


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----------------------------- auth ---------------------------------------- #
class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str
    email: str
    driver_id: Optional[int] = None


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    role: str
    driver_id: Optional[int] = None


# ----------------------------- portal --------------------------------------
class OtpRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=24)


class OtpRequestResult(BaseModel):
    phone: str
    sent: bool
    #: Present only while the fixed development code is in use.
    development_hint: Optional[str] = None


class OtpVerify(BaseModel):
    phone: str = Field(min_length=6, max_length=24)
    otp: str = Field(min_length=4, max_length=8)


class PartySession(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "party"
    account_id: int
    phone: str
    full_name: Optional[str] = None
    company_count: int


class PartyProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)


class CompanyOut(ORMModel):
    id: int
    name: str
    gst_number: Optional[str] = None
    contact_person: Optional[str] = None
    address: Optional[str] = None
    order_count: int = 0


class CompanyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    gst_number: Optional[str] = Field(default=None, max_length=32)
    contact_person: Optional[str] = Field(default=None, max_length=120)
    address: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    gst_number: Optional[str] = Field(default=None, max_length=32)
    contact_person: Optional[str] = Field(default=None, max_length=120)
    address: Optional[str] = None


# --------------------------- customers (control room) ----------------------
class CustomerOut(BaseModel):
    """A billing-party account as the control room sees it."""

    id: int
    phone: str
    full_name: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    #: None until the customer has signed in to the portal themselves.
    last_login_at: Optional[datetime] = None
    company_names: List[str] = []
    company_count: int = 0
    order_count: int = 0
    open_order_count: int = 0
    address_count: int = 0
    last_order_at: Optional[datetime] = None


class CompanyAdminOut(CompanyOut):
    """A company with the customer it belongs to."""

    customer_id: int
    customer_name: Optional[str] = None
    customer_phone: str


class CustomerDetail(CustomerOut):
    companies: List[CompanyAdminOut] = []


class CustomerCreate(BaseModel):
    """A customer added by the control room, usually while on the phone."""

    phone: str = Field(min_length=6, max_length=24)
    full_name: Optional[str] = Field(default=None, max_length=120)
    #: Their first company, so an order can be raised in the same breath.
    company: Optional[CompanyCreate] = None


class CustomerUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    is_active: Optional[bool] = None


class PortalOrderCreate(BaseModel):
    """An order raised by a billing party for one of its own companies."""

    company_id: int
    order_number: Optional[str] = Field(default=None, max_length=64)
    material: str = Field(min_length=1, max_length=120)
    quantity_tons: float = Field(gt=0)
    pickup_name: str = Field(min_length=1, max_length=160)
    pickup_phone: Optional[str] = Field(default=None, max_length=32)
    pickup_address: str = Field(min_length=1)
    drop_name: str = Field(min_length=1, max_length=160)
    drop_phone: Optional[str] = Field(default=None, max_length=32)
    drop_address: str = Field(min_length=1)
    pickup_date: date
    special_instructions: Optional[str] = None


class PortalStopOut(BaseModel):
    """A stop on the party's own consignment.

    Only stops that handle this party's order are ever returned, so one
    party cannot read another's addresses off a shared trip.
    """

    sequence: int
    stop_type: str
    status: str
    place_name: str
    place_address: str
    completed_at: Optional[datetime] = None


class PortalOrderBrief(BaseModel):
    id: int
    code: str
    order_number: Optional[str] = None
    company_id: Optional[int] = None
    company_name: str
    material: str
    quantity_tons: float
    status: str
    pickup_name: str
    drop_name: str
    pickup_date: date
    truck_registration: Optional[str] = None
    stage: str
    stage_detail: str
    #: True when the control room booked it for them, so the portal can say so.
    booked_by_us: bool = False


class PortalOrderOut(PortalOrderBrief):
    pickup_phone: Optional[str] = None
    pickup_address: str
    drop_phone: Optional[str] = None
    drop_address: str
    special_instructions: Optional[str] = None
    created_at: Optional[datetime] = None
    assigned_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    #: Carrier details, shown once a truck is assigned.
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    truck_capacity_tons: Optional[float] = None
    trip_code: Optional[str] = None
    trip_status: Optional[str] = None
    my_stops: List[PortalStopOut] = []


class PortalSummary(BaseModel):
    total: int
    awaiting_truck: int
    scheduled: int
    in_transit: int
    delivered: int
    companies: int


# --------------------------- driver app ------------------------------------
class DriverOtpVerify(BaseModel):
    phone: str = Field(min_length=6, max_length=24)
    otp: str = Field(min_length=4, max_length=8)


class DriverSession(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "driver_app"
    driver_id: int
    code: str
    name: str
    phone: str
    truck_registration: Optional[str] = None
    truck_capacity_tons: Optional[float] = None
    has_active_trip: bool = False


class DriverStopOrder(BaseModel):
    """What to load or hand over at a stop."""

    code: str
    order_number: Optional[str] = None
    billing_party: str
    material: str
    quantity_tons: float


class DriverStopOut(BaseModel):
    id: int
    sequence: int
    stop_type: str
    status: str
    place_name: str
    place_phone: Optional[str] = None
    place_address: str
    completed_at: Optional[datetime] = None
    #: The consignments handled here, so the driver hands over the right goods.
    orders: List[DriverStopOrder] = []
    #: Running weight on board once this stop is done.
    load_after_tons: float = 0.0


class DriverTripOut(BaseModel):
    id: int
    code: str
    status: str
    truck_registration: str
    truck_capacity_tons: float
    total_cargo_tons: float
    progress_percent: float
    stops_completed: int
    stop_count: int
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    #: The one thing the driver needs next; null once everything is closed.
    next_stop: Optional[DriverStopOut] = None
    stops: List[DriverStopOut] = []
    #: True when the control room has flagged this truck delayed.
    is_delayed: bool = False


class DriverTripBrief(BaseModel):
    id: int
    code: str
    status: str
    total_cargo_tons: float
    stop_count: int
    stops_completed: int
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class DriverTripStats(BaseModel):
    """One driver's record over every trip they have run."""

    total: int
    completed: int
    completed_cargo_tons: float


class DriverDelayReport(BaseModel):
    reason: str = Field(min_length=3, max_length=200)


# ----------------------------- places --------------------------------------
class SavedPlaceOut(ORMModel):
    """An address book entry, offered back instead of being retyped."""

    id: int
    label: str
    phone: Optional[str] = None
    address: str
    use_count: int = 0
    last_used_at: Optional[datetime] = None
    #: Who the entry belongs to. Only filled in for the control room's view.
    owner: Optional[str] = None


class SavedPlaceCreate(BaseModel):
    label: str = Field(min_length=2, max_length=160)
    phone: Optional[str] = Field(default=None, max_length=32)
    address: str = Field(min_length=3)


class SavedPlaceUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=2, max_length=160)
    phone: Optional[str] = Field(default=None, max_length=32)
    address: Optional[str] = Field(default=None, min_length=3)


# ----------------------------- drivers ------------------------------------- #
class DriverBrief(ORMModel):
    id: int
    code: str
    name: str
    phone: str
    status: str
    license_number: str


class DriverOut(DriverBrief):
    license_expiry: Optional[datetime] = None
    home_city: Optional[str] = None
    truck_id: Optional[int] = None
    truck_registration: Optional[str] = None
    current_trip_id: Optional[int] = None
    current_trip_code: Optional[str] = None
    completed_trips: int = 0


class DriverCreate(BaseModel):
    name: str
    phone: str
    license_number: str
    license_expiry: Optional[datetime] = None
    home_city: Optional[str] = None
    status: str = "available"


class DriverUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    license_number: Optional[str] = None
    license_expiry: Optional[datetime] = None
    home_city: Optional[str] = None
    status: Optional[str] = None


# ----------------------------- orders --------------------------------------
class OrderBrief(ORMModel):
    id: int
    code: str
    order_number: Optional[str] = None
    billing_party: str
    #: "admin" when raised in the control room, "portal" when the party did.
    source: str
    material: str
    quantity_tons: float
    status: str
    pickup_name: str
    drop_name: str
    pickup_date: date


class OrderOut(OrderBrief):
    #: Who placed it, when it came through the portal.
    placed_by_phone: Optional[str] = None
    company_id: Optional[int] = None
    #: The customer the order belongs to, whoever raised it.
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    pickup_phone: Optional[str] = None
    pickup_address: str
    drop_phone: Optional[str] = None
    drop_address: str
    special_instructions: Optional[str] = None
    truck_id: Optional[int] = None
    truck_registration: Optional[str] = None
    trip_id: Optional[int] = None
    trip_code: Optional[str] = None
    assigned_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class OrderCreate(BaseModel):
    """Weight is always tons, and both places are typed in full.

    ``company_id`` bills the order to a customer's company, which links it to
    that customer: it appears in their portal the moment they sign in. A bare
    ``billing_party`` name is still accepted for a one-off with no account.
    """

    company_id: Optional[int] = None
    billing_party: Optional[str] = Field(default=None, min_length=1, max_length=160)
    order_number: Optional[str] = Field(default=None, max_length=64)
    material: str = Field(min_length=1, max_length=120)
    quantity_tons: float = Field(gt=0)
    pickup_name: str = Field(min_length=1, max_length=160)
    pickup_phone: Optional[str] = Field(default=None, max_length=32)
    pickup_address: str = Field(min_length=1)
    drop_name: str = Field(min_length=1, max_length=160)
    drop_phone: Optional[str] = Field(default=None, max_length=32)
    drop_address: str = Field(min_length=1)
    pickup_date: date
    special_instructions: Optional[str] = None


class OrderUpdate(BaseModel):
    billing_party: Optional[str] = Field(default=None, min_length=1, max_length=160)
    order_number: Optional[str] = Field(default=None, max_length=64)
    material: Optional[str] = Field(default=None, min_length=1, max_length=120)
    quantity_tons: Optional[float] = Field(default=None, gt=0)
    pickup_name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    pickup_phone: Optional[str] = Field(default=None, max_length=32)
    pickup_address: Optional[str] = Field(default=None, min_length=1)
    drop_name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    drop_phone: Optional[str] = Field(default=None, max_length=32)
    drop_address: Optional[str] = Field(default=None, min_length=1)
    pickup_date: Optional[date] = None
    special_instructions: Optional[str] = None
    status: Optional[str] = None


# ----------------------------- trucks -------------------------------------- #
class CapacityOut(BaseModel):
    capacity_tons: float
    current_load_tons: float
    available_tons: float
    utilisation_percent: float
    order_count: int


class TruckBrief(ORMModel):
    id: int
    registration_number: str
    capacity_tons: float
    status: str
    base_city: Optional[str] = None


class TruckOut(TruckBrief):
    driver: Optional[DriverBrief] = None
    capacity: CapacityOut
    current_trip_id: Optional[int] = None
    current_trip_code: Optional[str] = None
    trip_status: Optional[str] = None
    trip_progress_percent: Optional[float] = None
    next_stop: Optional[str] = None
    next_stop_type: Optional[str] = None
    stops_remaining: Optional[int] = None
    final_drop: Optional[str] = None
    orders: List[OrderBrief] = []
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    axles: Optional[int] = None
    body_type: Optional[str] = None
    fuel_type: Optional[str] = None
    odometer_km: float = 0.0
    insurance_expiry: Optional[datetime] = None
    fitness_expiry: Optional[datetime] = None
    notes: Optional[str] = None


class TruckCreate(BaseModel):
    registration_number: str
    capacity_tons: float = Field(gt=0)
    driver_id: Optional[int] = None
    base_city: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    axles: Optional[int] = None
    body_type: Optional[str] = None
    fuel_type: Optional[str] = "Diesel"
    odometer_km: float = 0.0
    insurance_expiry: Optional[datetime] = None
    fitness_expiry: Optional[datetime] = None
    notes: Optional[str] = None
    status: str = "available"


class TruckUpdate(BaseModel):
    registration_number: Optional[str] = None
    capacity_tons: Optional[float] = Field(default=None, gt=0)
    driver_id: Optional[int] = None
    base_city: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    axles: Optional[int] = None
    body_type: Optional[str] = None
    fuel_type: Optional[str] = None
    odometer_km: Optional[float] = None
    insurance_expiry: Optional[datetime] = None
    fitness_expiry: Optional[datetime] = None
    notes: Optional[str] = None
    status: Optional[str] = None


# ----------------------------- trips --------------------------------------- #
class TripStopOut(ORMModel):
    id: int
    sequence: int
    stop_type: str
    status: str
    completed_at: Optional[datetime] = None
    place_name: str
    place_phone: Optional[str] = None
    place_address: str
    orders: List[OrderBrief] = []


class TripBrief(ORMModel):
    id: int
    code: str
    status: str
    total_cargo_tons: float
    progress_percent: float
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    truck_id: int
    truck_registration: Optional[str] = None
    truck_capacity_tons: Optional[float] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    order_count: int = 0
    stop_count: int = 0
    stops_completed: int = 0


class TripOut(TripBrief):
    truck: Optional[TruckBrief] = None
    driver: Optional[DriverBrief] = None
    orders: List[OrderBrief] = []
    stops: List[TripStopOut] = []
    next_stop: Optional[TripStopOut] = None


class TripCreate(BaseModel):
    truck_id: int
    order_ids: List[int] = Field(min_length=1)


class StopSpec(BaseModel):
    stop_type: str
    order_ids: List[int]


class ReorderRequest(BaseModel):
    stops: List[StopSpec] = Field(min_length=1)


# ----------------------------- assignment ---------------------------------- #
class AssignRequest(BaseModel):
    truck_id: int
    order_ids: List[int] = Field(min_length=1)
    create_trip: bool = True


class AssignPreviewRequest(BaseModel):
    truck_id: int
    order_ids: List[int] = Field(min_length=1)


class PlannedStopOut(BaseModel):
    sequence: int
    stop_type: str
    place_name: str
    place_address: str
    order_ids: List[int] = []


class AssignPreviewOut(BaseModel):
    allowed: bool
    reason: Optional[str] = None
    capacity_tons: float
    current_load_tons: float
    available_tons: float
    requested_tons: float
    load_after_tons: float
    utilisation_after_percent: float
    overflow_tons: float = 0.0
    planned_stops: List[PlannedStopOut] = []


class AssignBoardTotals(BaseModel):
    """Figures for the whole backlog, not just the page on screen."""

    unassigned_count: int
    unassigned_tons: float
    available_capacity_tons: float
    trucks_with_space: int


class AssignBoardOut(BaseModel):
    unassigned_orders: "Page[OrderOut]"
    trucks: "Page[TruckOut]"
    totals: AssignBoardTotals


class AssignResult(BaseModel):
    truck: TruckOut
    trip: Optional[TripOut] = None
    assigned_order_ids: List[int]
    capacity: CapacityOut


# ----------------------------- alerts -------------------------------------- #
class AlertOut(ORMModel):
    id: int
    kind: str
    severity: str
    title: str
    message: str
    truck_id: Optional[int] = None
    order_id: Optional[int] = None
    trip_id: Optional[int] = None
    driver_id: Optional[int] = None
    acknowledged: bool
    created_at: datetime
    truck_registration: Optional[str] = None
    order_code: Optional[str] = None


# ----------------------------- dashboard ----------------------------------- #
class TripStats(BaseModel):
    """Trip counts per status and the tonnage on the road, over the whole table."""

    total: int
    by_status: Dict[str, int]
    active_cargo_tons: float


class OrderStats(BaseModel):
    """Counts and tonnage per order status, computed over the whole table."""

    total: int
    total_tons: float
    by_status: Dict[str, int]
    tons_by_status: Dict[str, float]


class DriverStats(BaseModel):
    """Counts over the whole driver table, for filter chips that must not lie."""

    total: int
    by_status: Dict[str, int]
    without_truck: int


class FleetKpis(BaseModel):
    total_trucks: int
    active_trips: int
    available: int
    assigned: int
    in_transit: int
    at_pickup: int
    at_delivery: int
    delayed: int
    maintenance: int
    without_driver: int
    total_capacity_tons: float
    total_load_tons: float
    fleet_utilisation_percent: float


class OrderKpis(BaseModel):
    total_today: int
    pending: int
    assigned: int
    in_transit: int
    delivered: int
    pickup_overdue: int
    cargo_in_transit_tons: float
    pending_tons: float
    total_orders: int


class DashboardOut(BaseModel):
    fleet: FleetKpis
    orders: OrderKpis
    alerts_open: int
    generated_at: datetime


# ----------------------------- search -------------------------------------- #
class SearchHit(BaseModel):
    kind: str
    id: int
    label: str
    sublabel: Optional[str] = None
    badge: Optional[str] = None
    href: str


class SearchResults(BaseModel):
    query: str
    hits: List[SearchHit]


AssignBoardOut.model_rebuild()
