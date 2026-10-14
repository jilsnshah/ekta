import type { Alert } from './types'

/**
 * The page an alert should open. Alerts can reference several entities, so
 * this picks the most specific one: the order the operator must act on, then
 * the trip carrying it, then the vehicle or driver.
 */
export function alertTarget(alert: Alert): string | undefined {
  if (alert.order_id) return `/orders/${alert.order_id}`
  if (alert.trip_id) return `/trips/${alert.trip_id}`
  if (alert.truck_id) return `/trucks/${alert.truck_id}`
  if (alert.driver_id) return `/drivers/${alert.driver_id}`
  return undefined
}
