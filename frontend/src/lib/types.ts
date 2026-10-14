import type { Page } from './paging'
export type TruckStatus =
  | 'available'
  | 'assigned'
  | 'in_transit'
  | 'at_pickup'
  | 'at_delivery'
  | 'delayed'
  | 'maintenance'

export type OrderStatus =
  | 'new'
  | 'unassigned'
  | 'assigned'
  | 'pickup_pending'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'

export type TripStatus =
  | 'planned'
  | 'dispatched'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type DriverStatus = 'available' | 'on_trip' | 'resting' | 'unavailable'
export type StopType = 'pickup' | 'delivery'
export type StopStatus = 'pending' | 'completed' | 'skipped'

export interface Capacity {
  capacity_tons: number
  current_load_tons: number
  available_tons: number
  utilisation_percent: number
  order_count: number
}

/** An address book entry, offered back instead of being retyped. */
export interface SavedPlace {
  id: number
  label: string
  phone: string | null
  address: string
  use_count: number
  last_used_at: string | null
  /** Who it belongs to. Only filled in for the control room's view. */
  owner: string | null
}

export interface DriverBrief {
  id: number
  code: string
  name: string
  phone: string
  status: DriverStatus
  license_number: string
}

/** One driver's record over every trip they have run. */
export interface DriverTripStats {
  total: number
  completed: number
  completed_cargo_tons: number
}

/** Trip counts per status and the tonnage on the road, over the whole table. */
export interface TripStats {
  total: number
  by_status: Partial<Record<TripStatus, number>>
  active_cargo_tons: number
}

/** Counts and tonnage per order status, over the whole table. */
export interface OrderStats {
  total: number
  total_tons: number
  by_status: Partial<Record<OrderStatus, number>>
  tons_by_status: Partial<Record<OrderStatus, number>>
}

/** Counts over the whole driver table, for filter chips the page cannot tally. */
export interface DriverStats {
  total: number
  by_status: Partial<Record<DriverStatus, number>>
  without_truck: number
}

export interface Driver extends DriverBrief {
  license_expiry: string | null
  home_city: string | null
  truck_id: number | null
  truck_registration: string | null
  current_trip_id: number | null
  current_trip_code: string | null
  completed_trips: number
}

export interface OrderBrief {
  id: number
  /** System reference, always present. */
  code: string
  /** The billing party's own order number, if they quoted one. */
  order_number: string | null
  billing_party: string
  /** "admin" when raised in the control room, "portal" when the party did. */
  source: 'admin' | 'portal'
  material: string
  /** Weight is always tons. */
  quantity_tons: number
  status: OrderStatus
  pickup_name: string
  drop_name: string
  /** A date, not a timestamp: "2026-10-12". */
  pickup_date: string
}

export interface Order extends OrderBrief {
  placed_by_phone: string | null
  company_id: number | null
  pickup_phone: string | null
  pickup_address: string
  drop_phone: string | null
  drop_address: string
  special_instructions: string | null
  truck_id: number | null
  truck_registration: string | null
  trip_id: number | null
  trip_code: string | null
  assigned_at: string | null
  picked_up_at: string | null
  delivered_at: string | null
  created_at: string | null
}

export interface TruckBrief {
  id: number
  registration_number: string
  capacity_tons: number
  status: TruckStatus
  base_city: string | null
}

export interface Truck extends TruckBrief {
  driver: DriverBrief | null
  capacity: Capacity
  current_trip_id: number | null
  current_trip_code: string | null
  trip_status: TripStatus | null
  trip_progress_percent: number | null
  next_stop: string | null
  next_stop_type: StopType | null
  stops_remaining: number | null
  final_drop: string | null
  orders: OrderBrief[]
  make: string | null
  model: string | null
  year: number | null
  axles: number | null
  body_type: string | null
  fuel_type: string | null
  odometer_km: number
  insurance_expiry: string | null
  fitness_expiry: string | null
  notes: string | null
}

export interface TripStop {
  id: number
  sequence: number
  stop_type: StopType
  status: StopStatus
  completed_at: string | null
  place_name: string
  place_phone: string | null
  place_address: string
  orders: OrderBrief[]
}

export interface TripBrief {
  id: number
  code: string
  status: TripStatus
  total_cargo_tons: number
  progress_percent: number
  started_at: string | null
  completed_at: string | null
  truck_id: number
  truck_registration: string | null
  truck_capacity_tons: number | null
  driver_name: string | null
  driver_phone: string | null
  order_count: number
  stop_count: number
  stops_completed: number
}

export interface Trip extends TripBrief {
  truck: TruckBrief | null
  driver: DriverBrief | null
  orders: OrderBrief[]
  stops: TripStop[]
  next_stop: TripStop | null
}

export interface FleetKpis {
  total_trucks: number
  active_trips: number
  available: number
  assigned: number
  in_transit: number
  at_pickup: number
  at_delivery: number
  delayed: number
  maintenance: number
  without_driver: number
  total_capacity_tons: number
  total_load_tons: number
  fleet_utilisation_percent: number
}

export interface OrderKpis {
  total_today: number
  pending: number
  assigned: number
  in_transit: number
  delivered: number
  pickup_overdue: number
  cargo_in_transit_tons: number
  pending_tons: number
  total_orders: number
}

export interface Dashboard {
  fleet: FleetKpis
  orders: OrderKpis
  alerts_open: number
  generated_at: string
}

export interface Alert {
  id: number
  kind: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  truck_id: number | null
  order_id: number | null
  trip_id: number | null
  driver_id: number | null
  acknowledged: boolean
  created_at: string
  truck_registration: string | null
  order_code: string | null
}

export interface PlannedStop {
  sequence: number
  stop_type: StopType
  place_name: string
  place_address: string
  order_ids: number[]
}

export interface AssignPreview {
  allowed: boolean
  reason: string | null
  capacity_tons: number
  current_load_tons: number
  available_tons: number
  requested_tons: number
  load_after_tons: number
  utilisation_after_percent: number
  overflow_tons: number
  planned_stops: PlannedStop[]
}

export interface AssignResult {
  truck: Truck
  trip: Trip | null
  assigned_order_ids: number[]
  capacity: Capacity
}

export interface AssignBoard {
  /** Both sides are paged: either could be thousands of rows on a busy day. */
  unassigned_orders: Page<Order>
  trucks: Page<Truck>
  totals: {
    unassigned_count: number
    unassigned_tons: number
    available_capacity_tons: number
  }
}

export interface SearchHit {
  kind: 'truck' | 'driver' | 'order' | 'billing_party' | 'trip'
  id: number
  label: string
  sublabel: string | null
  badge: string | null
  href: string
}

export interface Session {
  access_token: string
  token_type: string
  role: 'admin' | 'driver'
  full_name: string
  email: string
  driver_id: number | null
}

/* ------------------------------ portal ----------------------------------- */

/** The billing party's own session, kept separately from the staff session. */
export interface PartySession {
  access_token: string
  token_type: string
  role: 'party'
  account_id: number
  phone: string
  full_name: string | null
  company_count: number
}

export interface Company {
  id: number
  name: string
  gst_number: string | null
  contact_person: string | null
  address: string | null
  order_count: number
}

/** What the party is shown instead of the internal order status. */
export type OrderStage =
  | 'placed'
  | 'scheduled'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'

export interface PortalStop {
  sequence: number
  stop_type: StopType
  status: StopStatus
  place_name: string
  place_address: string
  completed_at: string | null
}

export interface PortalOrderBrief {
  id: number
  code: string
  order_number: string | null
  company_id: number | null
  company_name: string
  material: string
  quantity_tons: number
  status: OrderStatus
  pickup_name: string
  drop_name: string
  pickup_date: string
  truck_registration: string | null
  stage: OrderStage
  stage_detail: string
}

export interface PortalOrder extends PortalOrderBrief {
  pickup_phone: string | null
  pickup_address: string
  drop_phone: string | null
  drop_address: string
  special_instructions: string | null
  created_at: string | null
  assigned_at: string | null
  picked_up_at: string | null
  delivered_at: string | null
  driver_name: string | null
  driver_phone: string | null
  truck_capacity_tons: number | null
  trip_code: string | null
  trip_status: TripStatus | null
  my_stops: PortalStop[]
}

export interface PortalSummary {
  total: number
  awaiting_truck: number
  scheduled: number
  in_transit: number
  delivered: number
  companies: number
}

/* ---------------------------- driver app --------------------------------- */

export interface DriverSession {
  access_token: string
  token_type: string
  role: 'driver_app'
  driver_id: number
  code: string
  name: string
  phone: string
  truck_registration: string | null
  truck_capacity_tons: number | null
  has_active_trip: boolean
}

export interface DriverStopOrder {
  code: string
  order_number: string | null
  billing_party: string
  material: string
  quantity_tons: number
}

export interface DriverStop {
  id: number
  sequence: number
  stop_type: StopType
  status: StopStatus
  place_name: string
  place_phone: string | null
  place_address: string
  completed_at: string | null
  orders: DriverStopOrder[]
  /** Weight on board once this stop is done. */
  load_after_tons: number
}

export interface DriverTrip {
  id: number
  code: string
  status: TripStatus
  truck_registration: string
  truck_capacity_tons: number
  total_cargo_tons: number
  progress_percent: number
  stops_completed: number
  stop_count: number
  started_at: string | null
  completed_at: string | null
  next_stop: DriverStop | null
  stops: DriverStop[]
  is_delayed: boolean
}

export interface DriverTripBrief {
  id: number
  code: string
  status: TripStatus
  total_cargo_tons: number
  stop_count: number
  stops_completed: number
  started_at: string | null
  completed_at: string | null
}

export interface OtpRequestResult {
  phone: string
  sent: boolean
  development_hint: string | null
}
