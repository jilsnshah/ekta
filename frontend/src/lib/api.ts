import type { Page } from './paging'
import type {
  Alert,
  AssignBoard,
  AssignPreview,
  AssignResult,
  Company,
  Dashboard,
  Driver,
  DriverSession,
  DriverTrip,
  DriverTripBrief,
  Order,
  OtpRequestResult,
  PartySession,
  DriverStats,
  OrderStats,
  TripStats,
  DriverTripStats,
  SavedPlace,
  PortalOrder,
  PortalOrderBrief,
  PortalSummary,
  SearchHit,
  Session,
  Trip,
  TripBrief,
  Truck,
} from './types'

const TOKEN_KEY = 'fleetops.session'
const PARTY_TOKEN_KEY = 'fleetops.party-session'
const DRIVER_TOKEN_KEY = 'fleetops.driver-session'

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, message: string, payload?: unknown) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(TOKEN_KEY, JSON.stringify(session))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private browsing: the app still works, the session just will not persist */
  }
}

/**
 * The billing party's session is stored under its own key. Staff and party
 * tokens are different audiences, and the server refuses each on the other's
 * endpoints, so they must never be confused for one another.
 */
export function loadPartySession(): PartySession | null {
  try {
    const raw = localStorage.getItem(PARTY_TOKEN_KEY)
    return raw ? (JSON.parse(raw) as PartySession) : null
  } catch {
    return null
  }
}

export function savePartySession(session: PartySession | null) {
  try {
    if (session) localStorage.setItem(PARTY_TOKEN_KEY, JSON.stringify(session))
    else localStorage.removeItem(PARTY_TOKEN_KEY)
  } catch {
    /* see saveSession */
  }
}

/** The driver app's session: a third audience, a third key. */
export function loadDriverSession(): DriverSession | null {
  try {
    const raw = localStorage.getItem(DRIVER_TOKEN_KEY)
    return raw ? (JSON.parse(raw) as DriverSession) : null
  } catch {
    return null
  }
}

export function saveDriverSession(session: DriverSession | null) {
  try {
    if (session) localStorage.setItem(DRIVER_TOKEN_KEY, JSON.stringify(session))
    else localStorage.removeItem(DRIVER_TOKEN_KEY)
  } catch {
    /* see saveSession */
  }
}

/** Pull a readable message out of FastAPI's several `detail` shapes. */
function describe(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>
    if (typeof d.message === 'string') return d.message
  }
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string; loc?: string[] }
    if (first?.msg) return `${first.loc?.slice(1).join('.') ?? 'field'}: ${first.msg}`
  }
  return `Request failed (${status})`
}

/**
 * Does `path` sit under `prefix`, as a path rather than as a string?
 *
 * A plain `startsWith` is wrong here and was a real bug: the driver app lives
 * under `/api/driver` and the control room's driver screens under
 * `/api/drivers`, so `'/api/drivers'.startsWith('/api/driver')` matched and
 * every control-room request for a driver was sent the driver app's token,
 * 401'd, and bounced the operator to the driver sign-in. The segment boundary
 * is what makes them different.
 */
function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

export type Audience = 'party' | 'driver' | 'staff'

/**
 * Which of the three sessions signs this request.
 *
 * Each audience has its own token, and the server refuses the other two on
 * every endpoint, so sending the wrong one is a 401 and a bounce to the wrong
 * sign-in screen. Exported so `render-check` can assert the mapping.
 */
export function audienceFor(path: string): Audience {
  if (under(path, '/api/portal')) return 'party'
  if (under(path, '/api/driver')) return 'driver'
  return 'staff'
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const audience = audienceFor(path)
  const token =
    audience === 'party'
      ? loadPartySession()?.access_token
      : audience === 'driver'
        ? loadDriverSession()?.access_token
        : loadSession()?.access_token

  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(path, { ...init, headers })

  if (response.status === 401) {
    const signingIn = path.includes('/auth/login') || path.includes('/auth/')
    if (audience === 'party') {
      savePartySession(null)
      if (!signingIn) window.location.hash = '#/portal/login'
    } else if (audience === 'driver') {
      saveDriverSession(null)
      if (!signingIn) window.location.hash = '#/driver/login'
    } else {
      saveSession(null)
      if (!signingIn) window.location.hash = '#/login'
    }
  }

  if (!response.ok) {
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, describe(response.status, body), body)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    if (Array.isArray(value)) {
      value.forEach((v) => search.append(key, String(v)))
    } else {
      search.append(key, String(value))
    }
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

/** Shared `?page=&page_size=` parameters. */
export interface PageQuery {
  page?: number
  page_size?: number
}

export interface TruckFilters extends PageQuery {
  status?: string[]
  driver_id?: number
  base_city?: string
  min_capacity?: number
  max_capacity?: number
  has_available_capacity?: boolean
  in_transit?: boolean
  with_pending_orders?: boolean
  without_driver?: boolean
  search?: string
  sort?: string
  descending?: boolean
}

export interface OrderFilters extends PageQuery {
  status?: string[]
  billing_party?: string
  truck_id?: number
  trip_id?: number
  unassigned?: boolean
  source?: string
  pickup_overdue?: boolean
  pickup_within_days?: number
  search?: string
  sort?: string
  descending?: boolean
}

export const api = {
  login: (email: string, password: string) =>
    request<Session>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  dashboard: () => request<Dashboard>('/api/dashboard'),

  trucks: (filters: TruckFilters = {}) =>
    request<Page<Truck>>(`/api/trucks${qs(filters as Record<string, unknown>)}`),
  truck: (id: number) => request<Truck>(`/api/trucks/${id}`),
  truckTrips: (id: number, params: PageQuery = {}) =>
    request<Page<TripBrief>>(
      `/api/trucks/${id}/trips${qs(params as Record<string, unknown>)}`,
    ),
  createTruck: (body: Record<string, unknown>) =>
    request<Truck>('/api/trucks', { method: 'POST', body: JSON.stringify(body) }),
  updateTruck: (id: number, body: Record<string, unknown>) =>
    request<Truck>(`/api/trucks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  setTruckStatus: (id: number, status: string) =>
    request<Truck>(`/api/trucks/${id}/status?status=${status}`, { method: 'POST' }),

  drivers: (
    params: PageQuery & {
      status?: string[]
      search?: string
      unassigned?: boolean
      sort?: string
    } = {},
  ) => request<Page<Driver>>(`/api/drivers${qs(params as Record<string, unknown>)}`),
  /** Fleet-wide driver counts, so the chips are not limited to one page. */
  driverStats: () => request<DriverStats>('/api/drivers/stats'),

  /** Table-wide order counts and tonnage, so chips and totals are not per-page. */
  orderStats: (params: { billing_party?: string; search?: string } = {}) =>
    request<OrderStats>(`/api/orders/stats${qs(params as Record<string, unknown>)}`),

  /** Table-wide trip counts, so the status chips are not limited to one page. */
  tripStats: (params: { search?: string } = {}) =>
    request<TripStats>(`/api/trips/stats${qs(params as Record<string, unknown>)}`),
  driver: (id: number) => request<Driver>(`/api/drivers/${id}`),
  driverTrips: (id: number, params: PageQuery = {}) =>
    request<Page<TripBrief>>(
      `/api/drivers/${id}/trips${qs(params as Record<string, unknown>)}`,
    ),
  createDriver: (body: Record<string, unknown>) =>
    request<Driver>('/api/drivers', { method: 'POST', body: JSON.stringify(body) }),
  updateDriver: (id: number, body: Record<string, unknown>) =>
    request<Driver>(`/api/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  assignDriverToTruck: (driverId: number, truckId: number) =>
    request<Driver>(`/api/drivers/${driverId}/assign-truck/${truckId}`, { method: 'POST' }),
  unassignDriver: (driverId: number) =>
    request<Driver>(`/api/drivers/${driverId}/assign-truck`, { method: 'DELETE' }),

  orders: (filters: OrderFilters = {}) =>
    request<Page<Order>>(`/api/orders${qs(filters as Record<string, unknown>)}`),
  order: (id: number) => request<Order>(`/api/orders/${id}`),
  /** Names already on file, to autocomplete the typed billing party. */
  billingParties: (search?: string) =>
    request<string[]>(`/api/orders/billing-parties${qs({ search })}`),
  /**
   * The control room's address book: its own entries first, then every
   * billing party's, each labelled with whose it is.
   */
  places: (params: PageQuery & { mine_only?: boolean; search?: string } = {}) =>
    request<Page<SavedPlace>>(
      `/api/orders/places${qs(params as Record<string, unknown>)}`,
    ),
  createPlace: (body: Record<string, unknown>) =>
    request<SavedPlace>('/api/orders/places', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePlace: (id: number, body: Record<string, unknown>) =>
    request<SavedPlace>(`/api/orders/places/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deletePlace: (id: number) =>
    request<void>(`/api/orders/places/${id}`, { method: 'DELETE' }),
  createOrder: (body: Record<string, unknown>) =>
    request<Order>('/api/orders', { method: 'POST', body: JSON.stringify(body) }),
  updateOrder: (id: number, body: Record<string, unknown>) =>
    request<Order>(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  cancelOrder: (id: number) =>
    request<Order>(`/api/orders/${id}/cancel`, { method: 'POST' }),

  board: (
    params: PageQuery & {
      order_search?: string
      order_sort?: string
      truck_search?: string
      truck_page?: number
      truck_page_size?: number
    } = {},
  ) =>
    request<AssignBoard>(
      `/api/assignment/board${qs(params as Record<string, unknown>)}`,
    ),
  previewAssign: (truckId: number, orderIds: number[]) =>
    request<AssignPreview>('/api/assignment/preview', {
      method: 'POST',
      body: JSON.stringify({ truck_id: truckId, order_ids: orderIds }),
    }),
  assign: (truckId: number, orderIds: number[], createTrip = true) =>
    request<AssignResult>('/api/assignment/assign', {
      method: 'POST',
      body: JSON.stringify({ truck_id: truckId, order_ids: orderIds, create_trip: createTrip }),
    }),
  unassign: (orderId: number) =>
    request<AssignResult>(`/api/assignment/unassign/${orderId}`, { method: 'POST' }),

  trips: (
    params: PageQuery & {
      status?: string[]
      active?: boolean
      truck_id?: number
      search?: string
      sort?: string
      descending?: boolean
    } = {},
  ) => request<Page<TripBrief>>(`/api/trips${qs(params as Record<string, unknown>)}`),
  trip: (id: number) => request<Trip>(`/api/trips/${id}`),
  startTrip: (id: number) => request<Trip>(`/api/trips/${id}/start`, { method: 'POST' }),
  replanTrip: (id: number) => request<Trip>(`/api/trips/${id}/replan`, { method: 'POST' }),
  reorderTrip: (id: number, stops: { stop_type: string; order_ids: number[] }[]) =>
    request<Trip>(`/api/trips/${id}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ stops }),
    }),
  completeStop: (tripId: number, stopId: number) =>
    request<Trip>(`/api/trips/${tripId}/stops/${stopId}/complete`, { method: 'POST' }),
  completeTrip: (id: number) => request<Trip>(`/api/trips/${id}/complete`, { method: 'POST' }),
  cancelTrip: (id: number) => request<Trip>(`/api/trips/${id}/cancel`, { method: 'POST' }),

  alerts: (
    params: PageQuery & {
      acknowledged?: boolean
      severity?: string[]
      kind?: string[]
      search?: string
    } = {},
  ) => request<Page<Alert>>(`/api/alerts${qs(params as Record<string, unknown>)}`),
  /** Just the badge number, so the nav never pulls a page of rows. */
  openAlertCount: () => request<number>('/api/alerts/open-count'),
  acknowledgeAlert: (id: number) =>
    request<Alert>(`/api/alerts/${id}/acknowledge`, { method: 'POST' }),
  acknowledgeAllAlerts: () =>
    request<{ acknowledged: number }>('/api/alerts/acknowledge-all', { method: 'POST' }),

  search: (q: string) =>
    request<{ query: string; hits: SearchHit[] }>(
      `/api/search?q=${encodeURIComponent(q)}`,
    ),

  /* ------------------------------ portal ------------------------------- */
  portal: {
    requestOtp: (phone: string) =>
      request<OtpRequestResult>('/api/portal/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),
    verifyOtp: (phone: string, otp: string) =>
      request<PartySession>('/api/portal/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, otp }),
      }),
    me: () => request<PartySession>('/api/portal/me'),
    updateMe: (full_name: string) =>
      request<PartySession>('/api/portal/me', {
        method: 'PATCH',
        body: JSON.stringify({ full_name }),
      }),

    companies: () => request<Company[]>('/api/portal/companies'),
    createCompany: (body: Record<string, unknown>) =>
      request<Company>('/api/portal/companies', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateCompany: (id: number, body: Record<string, unknown>) =>
      request<Company>(`/api/portal/companies/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deleteCompany: (id: number) =>
      request<void>(`/api/portal/companies/${id}`, { method: 'DELETE' }),

    /** The party's own address book, most-used first. */
    places: (params: PageQuery & { search?: string } = {}) =>
      request<Page<SavedPlace>>(
        `/api/portal/places${qs(params as Record<string, unknown>)}`,
      ),
    createPlace: (body: Record<string, unknown>) =>
      request<SavedPlace>('/api/portal/places', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updatePlace: (id: number, body: Record<string, unknown>) =>
      request<SavedPlace>(`/api/portal/places/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deletePlace: (id: number) =>
      request<void>(`/api/portal/places/${id}`, { method: 'DELETE' }),

    summary: () => request<PortalSummary>('/api/portal/summary'),
    orders: (params: PageQuery & { stage?: string; search?: string } = {}) =>
      request<Page<PortalOrderBrief>>(
        `/api/portal/orders${qs(params as Record<string, unknown>)}`,
      ),
    order: (id: number) => request<PortalOrder>(`/api/portal/orders/${id}`),
    createOrder: (body: Record<string, unknown>) =>
      request<PortalOrder>('/api/portal/orders', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    cancelOrder: (id: number) =>
      request<PortalOrder>(`/api/portal/orders/${id}/cancel`, { method: 'POST' }),
  },

  /* --------------------------- driver app ------------------------------ */
  // Named driverApp, not driver: api.driver(id) is the admin's driver record.
  driverApp: {
    requestOtp: (phone: string) =>
      request<OtpRequestResult>('/api/driver/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),
    verifyOtp: (phone: string, otp: string) =>
      request<DriverSession>('/api/driver/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, otp }),
      }),
    me: () => request<DriverSession>('/api/driver/me'),

    currentTrip: () => request<DriverTrip | null>('/api/driver/trip/current'),
    trip: (id: number) => request<DriverTrip>(`/api/driver/trips/${id}`),
    history: (params: PageQuery = {}) =>
      request<Page<DriverTripBrief>>(
        `/api/driver/trips${qs(params as Record<string, unknown>)}`,
      ),
    /** Their whole record, counted by the server rather than per page. */
    historyStats: () => request<DriverTripStats>('/api/driver/trips/stats'),

    startTrip: (id: number) =>
      request<DriverTrip>(`/api/driver/trips/${id}/start`, { method: 'POST' }),
    completeStop: (tripId: number, stopId: number) =>
      request<DriverTrip>(`/api/driver/trips/${tripId}/stops/${stopId}/complete`, {
        method: 'POST',
      }),
    reportDelay: (id: number, reason: string) =>
      request<DriverTrip>(`/api/driver/trips/${id}/report-delay`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    clearDelay: (id: number) =>
      request<DriverTrip>(`/api/driver/trips/${id}/clear-delay`, { method: 'POST' }),
  },

  health: () =>
    request<{
      status: string
      trucks: number
      websocket_clients: number
      database: string
    }>('/api/system/health'),
}
