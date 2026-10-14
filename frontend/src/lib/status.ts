import type { DriverStatus, OrderStatus, TripStatus, TruckStatus } from './types'

/**
 * Every status chip in the app is built the same way: the hue at full strength
 * for the text and the dot, a 10% tint behind it, a 20% border.
 *
 * The class strings are written out in full rather than composed at runtime,
 * because Tailwind generates utilities by scanning source text -- a template
 * literal would produce a class that never gets compiled.
 */
export interface StatusMeta {
  label: string
  /** Classes for the chip wrapper. */
  chip: string
  /** Class for the leading dot. */
  dot: string
  /** Text-only colour, for when a full chip would be too heavy. */
  text: string
}

const HUE = {
  available: {
    chip: 'bg-st-available/10 text-st-available border-st-available/20',
    dot: 'bg-st-available',
    text: 'text-st-available',
  },
  assigned: {
    chip: 'bg-st-assigned/10 text-st-assigned border-st-assigned/20',
    dot: 'bg-st-assigned',
    text: 'text-st-assigned',
  },
  transit: {
    chip: 'bg-st-transit/10 text-st-transit border-st-transit/20',
    dot: 'bg-st-transit',
    text: 'text-st-transit',
  },
  pickup: {
    chip: 'bg-st-pickup/10 text-st-pickup border-st-pickup/20',
    dot: 'bg-st-pickup',
    text: 'text-st-pickup',
  },
  delivery: {
    chip: 'bg-st-delivery/10 text-st-delivery border-st-delivery/20',
    dot: 'bg-st-delivery',
    text: 'text-st-delivery',
  },
  delayed: {
    chip: 'bg-st-delayed/10 text-st-delayed border-st-delayed/20',
    dot: 'bg-st-delayed',
    text: 'text-st-delayed',
  },
  maint: {
    chip: 'bg-st-maint/10 text-st-maint border-st-maint/20',
    dot: 'bg-st-maint',
    text: 'text-st-maint',
  },
  muted: {
    chip: 'bg-st-muted/10 text-st-muted border-st-muted/20',
    dot: 'bg-st-muted',
    text: 'text-st-muted',
  },
} as const

type Hue = keyof typeof HUE

const meta = (label: string, hue: Hue): StatusMeta => ({ label, ...HUE[hue] })

export const TRUCK_STATUS: Record<TruckStatus, StatusMeta> = {
  available: meta('Available', 'available'),
  assigned: meta('Assigned', 'assigned'),
  in_transit: meta('In Transit', 'transit'),
  at_pickup: meta('At Pickup', 'pickup'),
  at_delivery: meta('At Delivery', 'delivery'),
  delayed: meta('Delayed', 'delayed'),
  maintenance: meta('Maintenance', 'maint'),
}

/** Display order for filter chips and legends. */
export const TRUCK_STATUS_ORDER: TruckStatus[] = [
  'available',
  'assigned',
  'in_transit',
  'at_pickup',
  'at_delivery',
  'delayed',
  'maintenance',
]

/** Statuses the operator may set by hand; the rest follow the trip. */
export const OPERATOR_SETTABLE_STATUSES: TruckStatus[] = [
  'available',
  'at_pickup',
  'at_delivery',
  'delayed',
  'maintenance',
]

export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  new: meta('New', 'assigned'),
  unassigned: meta('Unassigned', 'assigned'),
  assigned: meta('Assigned', 'transit'),
  pickup_pending: meta('Pickup Pending', 'pickup'),
  picked_up: meta('Picked Up', 'delivery'),
  in_transit: meta('In Transit', 'transit'),
  delivered: meta('Delivered', 'available'),
  cancelled: meta('Cancelled', 'muted'),
}

export const ORDER_STATUS_ORDER: OrderStatus[] = [
  'unassigned',
  'assigned',
  'pickup_pending',
  'picked_up',
  'in_transit',
  'delivered',
  'cancelled',
]

export const TRIP_STATUS: Record<TripStatus, StatusMeta> = {
  planned: meta('Planned', 'assigned'),
  dispatched: meta('Dispatched', 'transit'),
  in_progress: meta('In Progress', 'transit'),
  completed: meta('Completed', 'available'),
  cancelled: meta('Cancelled', 'muted'),
}

export const TRIP_STATUS_ORDER: TripStatus[] = [
  'planned',
  'in_progress',
  'completed',
  'cancelled',
]

export const DRIVER_STATUS: Record<DriverStatus, StatusMeta> = {
  available: meta('Available', 'available'),
  on_trip: meta('On Trip', 'transit'),
  resting: meta('Resting', 'maint'),
  unavailable: meta('Unavailable', 'muted'),
}

export const DRIVER_STATUS_ORDER: DriverStatus[] = [
  'available',
  'on_trip',
  'resting',
  'unavailable',
]

export const SEVERITY: Record<string, StatusMeta> = {
  critical: meta('Critical', 'delayed'),
  warning: meta('Warning', 'assigned'),
  info: meta('Info', 'transit'),
}

export const SEVERITY_ORDER = ['critical', 'warning', 'info'] as const

/** Stop legs are colour-coded the same way everywhere. */
export const STOP_TYPE: Record<'pickup' | 'delivery', StatusMeta> = {
  pickup: meta('Pickup', 'pickup'),
  delivery: meta('Delivery', 'delivery'),
}

/**
 * Load bar colour: neutral while there is room, amber when nearly full, red at
 * capacity -- so an operator reads headroom without checking the numbers.
 */
export function loadTone(percent: number): { bar: string; text: string } {
  if (percent >= 99.5) return { bar: 'bg-st-delayed', text: 'text-st-delayed' }
  if (percent >= 85) return { bar: 'bg-st-pickup', text: 'text-st-pickup' }
  return { bar: 'bg-st-transit', text: 'text-ink' }
}
