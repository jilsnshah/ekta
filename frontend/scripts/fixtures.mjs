/** Minimal but type-shaped API fixtures for the render check. */

export const ORDER_BRIEF = {
  id: 1,
  code: 'TO-9001',
  order_number: 'PO-7781',
  billing_party: 'ABC Industries',
  source: 'portal',
  material: 'Steel Rods',
  quantity_tons: 8,
  status: 'assigned',
  pickup_name: 'Kadi Godown',
  drop_name: 'Sanand Plant Gate 3',
  pickup_date: '2026-10-12',
}

export const ORDER = {
  ...ORDER_BRIEF,
  placed_by_phone: '+91 98765 43210',
  company_id: 1,
  pickup_phone: '+91 7012345678',
  pickup_address: 'Survey 44, Kadi Highway, Mehsana - 382715',
  drop_phone: '+91 7098765432',
  drop_address: 'Plot 9, Sanand GIDC, Ahmedabad - 382110',
  special_instructions: 'Tarpaulin mandatory.',
  truck_id: 1,
  truck_registration: 'GJ01TEST',
  trip_id: 1,
  trip_code: 'TRIP-TEST-1',
  assigned_at: '2026-10-05T10:00:00',
  picked_up_at: null,
  delivered_at: null,
  created_at: '2026-10-05T08:00:00',
}

export const UNASSIGNED_ORDER = {
  ...ORDER,
  id: 2,
  code: 'TO-9002',
  order_number: null,
  status: 'unassigned',
  quantity_tons: 6,
  truck_id: null,
  truck_registration: null,
  trip_id: null,
  trip_code: null,
  assigned_at: null,
}

export const DRIVER_BRIEF = {
  id: 1,
  code: 'DRV-0001',
  name: 'Test Driver',
  phone: '+91 9900000000',
  status: 'on_trip',
  license_number: 'GJ01-2020-1234567',
}

export const DRIVER = {
  ...DRIVER_BRIEF,
  license_expiry: '2028-01-01T00:00:00',
  home_city: 'Ahmedabad',
  truck_id: 1,
  truck_registration: 'GJ01TEST',
  current_trip_id: 1,
  current_trip_code: 'TRIP-TEST-1',
  completed_trips: 12,
}

const CAPACITY = {
  capacity_tons: 20,
  current_load_tons: 8,
  available_tons: 12,
  utilisation_percent: 40,
  order_count: 1,
}

export const TRUCK_BRIEF = {
  id: 1,
  registration_number: 'GJ01TEST',
  capacity_tons: 20,
  status: 'in_transit',
  base_city: 'Ahmedabad',
}

export const TRUCK = {
  ...TRUCK_BRIEF,
  driver: DRIVER_BRIEF,
  capacity: CAPACITY,
  current_trip_id: 1,
  current_trip_code: 'TRIP-TEST-1',
  trip_status: 'in_progress',
  trip_progress_percent: 50,
  next_stop: 'Sanand Plant Gate 3',
  next_stop_type: 'delivery',
  stops_remaining: 1,
  final_drop: 'Sanand Plant Gate 3',
  orders: [ORDER_BRIEF],
  make: 'Tata',
  model: 'Signa 4825',
  year: 2022,
  axles: 6,
  body_type: 'Trailer',
  fuel_type: 'Diesel',
  odometer_km: 184000,
  insurance_expiry: '2027-03-01T00:00:00',
  fitness_expiry: '2027-06-01T00:00:00',
  notes: 'Fixture truck.',
}

/** A truck with free space, for the assignment board. */
export const EMPTY_TRUCK = {
  ...TRUCK,
  id: 2,
  registration_number: 'GJ02TEST',
  status: 'available',
  capacity: {
    capacity_tons: 25,
    current_load_tons: 0,
    available_tons: 25,
    utilisation_percent: 0,
    order_count: 0,
  },
  current_trip_id: null,
  current_trip_code: null,
  trip_status: null,
  trip_progress_percent: null,
  next_stop: null,
  next_stop_type: null,
  stops_remaining: null,
  final_drop: null,
  orders: [],
}

const stop = (id, sequence, stop_type, place, status) => ({
  id,
  sequence,
  stop_type,
  status,
  completed_at: status === 'completed' ? '2026-10-06T07:30:00' : null,
  place_name: place.name,
  place_phone: place.phone,
  place_address: place.address,
  orders: [ORDER_BRIEF],
})

const PICKUP_PLACE = {
  name: 'Kadi Godown',
  phone: '+91 7012345678',
  address: 'Survey 44, Kadi Highway, Mehsana - 382715',
}
const DROP_PLACE = {
  name: 'Sanand Plant Gate 3',
  phone: '+91 7098765432',
  address: 'Plot 9, Sanand GIDC, Ahmedabad - 382110',
}

export const TRIP_BRIEF = {
  id: 1,
  code: 'TRIP-TEST-1',
  status: 'in_progress',
  total_cargo_tons: 8,
  progress_percent: 50,
  started_at: '2026-10-06T06:30:00',
  completed_at: null,
  truck_id: 1,
  truck_registration: 'GJ01TEST',
  truck_capacity_tons: 20,
  driver_name: DRIVER_BRIEF.name,
  driver_phone: DRIVER_BRIEF.phone,
  order_count: 1,
  stop_count: 2,
  stops_completed: 1,
}

/** One completed stop and one pending, which is the case that broke. */
export const TRIP = {
  ...TRIP_BRIEF,
  truck: TRUCK_BRIEF,
  driver: DRIVER_BRIEF,
  orders: [ORDER_BRIEF],
  stops: [
    stop(1, 0, 'pickup', PICKUP_PLACE, 'completed'),
    stop(2, 1, 'delivery', DROP_PLACE, 'pending'),
  ],
  next_stop: stop(2, 1, 'delivery', DROP_PLACE, 'pending'),
}

export const ALERT = {
  id: 1,
  kind: 'deadline_approaching',
  severity: 'critical',
  title: 'Test alert title',
  message: 'Test alert message body.',
  truck_id: 1,
  order_id: 1,
  trip_id: 1,
  driver_id: 1,
  acknowledged: false,
  created_at: '2026-10-06T09:00:00',
  truck_registration: 'GJ01TEST',
  order_code: 'TO-9001',
}

export const DASHBOARD = {
  fleet: {
    total_trucks: 72,
    active_trips: 47,
    available: 12,
    assigned: 10,
    in_transit: 33,
    at_pickup: 8,
    at_delivery: 5,
    delayed: 3,
    maintenance: 1,
    without_driver: 2,
    total_capacity_tons: 1583,
    total_load_tons: 690,
    fleet_utilisation_percent: 43.6,
  },
  orders: {
    total_today: 41,
    pending: 38,
    assigned: 51,
    in_transit: 33,
    delivered: 15,
    pickup_overdue: 12,
    cargo_in_transit_tons: 273,
    pending_tons: 496,
    total_orders: 137,
  },
  alerts_open: 77,
  generated_at: '2026-10-06T10:00:00',
}

// Both halves of the board arrive paged. `pageOf` is a hoisted function
// declaration, so calling it here is fine.
export const BOARD = {
  unassigned_orders: pageOf([UNASSIGNED_ORDER], 25),
  trucks: pageOf([EMPTY_TRUCK], 24),
  totals: {
    unassigned_count: 1,
    unassigned_tons: 6,
    available_capacity_tons: 25,
  },
}

/* ------------------------------ stats ------------------------------------ */
// The figures behind the filter chips and headline numbers. The server counts
// these over the whole table, so they are deliberately larger than the rows
// seeded above -- a page is not meant to add up to them.

export const DRIVER_STATS = {
  total: 72,
  by_status: { available: 40, on_trip: 30, off_duty: 2 },
  without_truck: 4,
}

export const ORDER_STATS = {
  total: 48,
  total_tons: 612.5,
  by_status: { unassigned: 12, assigned: 9, in_transit: 7, delivered: 20 },
  tons_by_status: {
    unassigned: 148.5,
    assigned: 96,
    in_transit: 84,
    delivered: 284,
  },
}

export const TRIP_STATS = {
  total: 26,
  by_status: { planned: 4, dispatched: 3, in_progress: 7, completed: 12 },
  active_cargo_tons: 132.5,
}

export const DRIVER_TRIP_STATS = {
  total: 9,
  completed: 8,
  completed_cargo_tons: 164,
}

export const SAVED_PLACES = [
  {
    id: 1,
    label: 'Kadi Godown',
    phone: '+91 7012345678',
    address: 'Survey 44, Kadi Highway, Mehsana - 382715',
    use_count: 6,
    last_used_at: '2026-10-05T08:00:00',
    owner: null,
  },
  {
    id: 2,
    label: 'Sanand Plant Gate 3',
    phone: '+91 7098765432',
    address: 'Plot 9, Sanand GIDC, Ahmedabad - 382110',
    use_count: 3,
    last_used_at: '2026-10-04T08:00:00',
    owner: null,
  },
]

/** The control room's view labels each entry with its owner. */
export const ADMIN_PLACES = [
  { ...SAVED_PLACES[0], owner: 'Control room' },
  { ...SAVED_PLACES[1], owner: 'Nitin Agrawal' },
]

/* ------------------------------- portal ---------------------------------- */

export const PARTY_SESSION = {
  access_token: 'party-token',
  token_type: 'bearer',
  role: 'party',
  account_id: 1,
  phone: '+91 98765 43210',
  full_name: 'Nitin Agrawal',
  company_count: 2,
}

export const COMPANIES = [
  {
    id: 1,
    name: 'ABC Industries',
    gst_number: '24AAACA1234A1Z5',
    contact_person: 'Nitin Agrawal',
    address: 'Block C, Naroda GIDC, Ahmedabad - 382330',
    order_count: 4,
  },
  {
    id: 2,
    name: 'ABC Steel Trading',
    gst_number: null,
    contact_person: null,
    address: null,
    order_count: 0,
  },
]

export const PORTAL_ORDER_BRIEF = {
  id: 1,
  code: 'TO-9001',
  order_number: 'PO-7781',
  company_id: 1,
  company_name: 'ABC Industries',
  material: 'Steel Rods',
  quantity_tons: 8,
  status: 'in_transit',
  pickup_name: 'Kadi Godown',
  drop_name: 'Sanand Plant Gate 3',
  pickup_date: '2026-10-12',
  truck_registration: 'GJ01TEST',
  stage: 'in_transit',
  stage_detail: 'Collected and on the way',
}

export const PORTAL_ORDER = {
  ...PORTAL_ORDER_BRIEF,
  pickup_phone: '+91 7012345678',
  pickup_address: 'Survey 44, Kadi Highway, Mehsana - 382715',
  drop_phone: '+91 7098765432',
  drop_address: 'Plot 9, Sanand GIDC, Ahmedabad - 382110',
  special_instructions: 'Tarpaulin mandatory.',
  created_at: '2026-10-05T08:00:00',
  assigned_at: '2026-10-05T10:00:00',
  picked_up_at: '2026-10-06T07:30:00',
  delivered_at: null,
  driver_name: 'Test Driver',
  driver_phone: '+91 9900000000',
  truck_capacity_tons: 20,
  trip_code: 'TRIP-TEST-1',
  trip_status: 'in_progress',
  my_stops: [
    {
      sequence: 0,
      stop_type: 'pickup',
      status: 'completed',
      place_name: 'Kadi Godown',
      place_address: 'Survey 44, Kadi Highway, Mehsana - 382715',
      completed_at: '2026-10-06T07:30:00',
    },
    {
      sequence: 1,
      stop_type: 'delivery',
      status: 'pending',
      place_name: 'Sanand Plant Gate 3',
      place_address: 'Plot 9, Sanand GIDC, Ahmedabad - 382110',
      completed_at: null,
    },
  ],
}

export const PORTAL_SUMMARY = {
  total: 4,
  awaiting_truck: 1,
  scheduled: 1,
  in_transit: 1,
  delivered: 1,
  companies: 2,
}

/* ----------------------------- driver app -------------------------------- */

export const DRIVER_SESSION = {
  access_token: 'driver-token',
  token_type: 'bearer',
  role: 'driver_app',
  driver_id: 1,
  code: 'DRV-0001',
  name: 'Vinod Pandya',
  phone: '+91 90000 00001',
  truck_registration: 'GJ01TEST',
  truck_capacity_tons: 20,
  has_active_trip: true,
}

const driverStopOrder = {
  code: 'TO-9001',
  order_number: 'PO-7781',
  billing_party: 'ABC Industries',
  material: 'Steel Rods',
  quantity_tons: 8,
}

export const DRIVER_TRIP = {
  id: 1,
  code: 'TRIP-TEST-1',
  status: 'in_progress',
  truck_registration: 'GJ01TEST',
  truck_capacity_tons: 20,
  total_cargo_tons: 8,
  progress_percent: 0,
  stops_completed: 0,
  stop_count: 2,
  started_at: '2026-10-06T06:30:00',
  completed_at: null,
  is_delayed: false,
  next_stop: {
    id: 1,
    sequence: 0,
    stop_type: 'pickup',
    status: 'pending',
    place_name: 'Kadi Godown',
    place_phone: '+91 7012345678',
    place_address: 'Survey 44, Kadi Highway, Mehsana - 382715',
    completed_at: null,
    orders: [driverStopOrder],
    load_after_tons: 8,
  },
  stops: [
    {
      id: 1,
      sequence: 0,
      stop_type: 'pickup',
      status: 'pending',
      place_name: 'Kadi Godown',
      place_phone: '+91 7012345678',
      place_address: 'Survey 44, Kadi Highway, Mehsana - 382715',
      completed_at: null,
      orders: [driverStopOrder],
      load_after_tons: 8,
    },
    {
      id: 2,
      sequence: 1,
      stop_type: 'delivery',
      status: 'pending',
      place_name: 'Sanand Plant Gate 3',
      place_phone: '+91 7098765432',
      place_address: 'Plot 9, Sanand GIDC, Ahmedabad - 382110',
      completed_at: null,
      orders: [driverStopOrder],
      load_after_tons: 0,
    },
  ],
}

export const DRIVER_HISTORY = [
  {
    id: 2,
    code: 'TRIP-TEST-0',
    status: 'completed',
    total_cargo_tons: 14,
    stop_count: 2,
    stops_completed: 2,
    started_at: '2026-10-01T06:00:00',
    completed_at: '2026-10-01T18:00:00',
  },
]

/**
 * React Query cache entries, keyed exactly as each page asks for them. A page
 * whose key is missing here renders a spinner, which the marker assertion in
 * render-check.mjs then fails on.
 */
/* ---------------------------- page envelopes ------------------------------ */

/**
 * Wrap rows the way every list endpoint now returns them.
 *
 * `total` is deliberately the number of rows given, so a page rendered from a
 * fixture shows "2 addresses" rather than claiming a second page exists.
 */
export function pageOf(items, pageSize = 25) {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: pageSize,
    pages: items.length ? 1 : 0,
    has_next: false,
    has_previous: false,
  }
}

/**
 * The cache key `usePaged` actually builds: the caller's key, then the filter
 * fingerprint, the page number and the page size.
 *
 * Seeding has to match it exactly, so this mirrors the hook rather than
 * guessing. `filters` is the hook's filter object at first render -- keys set
 * to `undefined` drop out of `JSON.stringify`, which is why most pages
 * fingerprint as `{}`.
 */
function pagedKey(key, { filters = {}, pageSize = 25 } = {}) {
  return [...key, JSON.stringify(filters), 1, pageSize]
}

const pagedEntry = (key, items, options = {}) => [
  pagedKey(key, options),
  pageOf(items, options.pageSize ?? 25),
]

export function seedEntries() {
  const fleet = [TRUCK, EMPTY_TRUCK]
  return [
    [['dashboard'], DASHBOARD],

    // ---- control room, paged lists
    pagedEntry(['trucks'], fleet),
    pagedEntry(['trucks', 'dashboard'], fleet, { pageSize: 10 }),
    pagedEntry(['drivers'], [DRIVER]),
    pagedEntry(['orders'], [ORDER, UNASSIGNED_ORDER]),
    pagedEntry(['trips'], [TRIP_BRIEF]),
    pagedEntry(['places'], ADMIN_PLACES),
    pagedEntry(['truck-trips', 1], [TRIP_BRIEF], { pageSize: 10 }),
    pagedEntry(['driver-trips', 1], [TRIP_BRIEF], { pageSize: 10 }),
    // Alerts start with acknowledged ones hidden, so that is in the print.
    pagedEntry(['alerts'], [ALERT], { filters: { acknowledged: false } }),

    // ---- control room, single records and side queries
    [['truck', 1], TRUCK],
    [['driver', 1], DRIVER],
    [['order', 1], ORDER],
    [['trip', 1], TRIP],
    [['trucks', 'without-driver'], pageOf(fleet, 200)],
    [['drivers', 'for-truck', null], pageOf([DRIVER], 200)],
    [['drivers', 'for-truck', 1], pageOf([DRIVER], 200)],
    [['drivers', 'stats'], DRIVER_STATS],
    [['orders', 'stats', null, ''], ORDER_STATS],
    [['trips', 'stats', ''], TRIP_STATS],
    [['places', 'own-count'], pageOf([ADMIN_PLACES[0]], 1)],
    [['places', ''], pageOf(ADMIN_PLACES, 25)],
    [['alerts', 'dashboard'], pageOf([ALERT], 8)],
    [['alerts', 'open-count'], 1],
    [['orders', 'urgent'], pageOf([UNASSIGNED_ORDER], 12)],
    [['billing-parties'], ['ABC Industries', 'Walk-in Traders']],

    // The board pages each half separately, so its key carries both positions.
    [['board', 1, '', 'pickup_date', 1, ''], BOARD],

    // ---- portal
    pagedEntry(['portal-orders'], [PORTAL_ORDER_BRIEF]),
    pagedEntry(['portal-places'], SAVED_PLACES, { pageSize: 12 }),
    [['portal-places', ''], pageOf(SAVED_PLACES, 25)],
    [['portal-companies'], COMPANIES],
    [['portal-summary'], PORTAL_SUMMARY],
    [['portal-order', 1], PORTAL_ORDER],

    // ---- driver app
    [['driver-trip'], DRIVER_TRIP],
    pagedEntry(['driver-history'], DRIVER_HISTORY, { pageSize: 15 }),
    [['driver-history', 'stats'], DRIVER_TRIP_STATS],
  ]
}
