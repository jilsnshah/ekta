import type { StopType } from './types'

/** The minimum a stop needs for the sequence to be checkable. */
export interface SequenceStop {
  stop_type: StopType
  order_ids: number[]
}

/**
 * Advisory mirror of the backend's `sequencing.is_feasible`.
 *
 * It exists so a drag can be rejected with a readable message the moment it
 * happens, instead of after a round trip. The server still decides -- this
 * only ever blocks the save button early.
 *
 * Returns a human-readable problem, or null when the sequence is legal.
 */
export function sequenceProblem(
  stops: SequenceStop[],
  tonsByOrder: Map<number, number>,
  capacityTons: number,
  codeByOrder?: Map<number, string>,
): string | null {
  const picked = new Set<number>()
  let load = 0

  const name = (orderId: number) => codeByOrder?.get(orderId) ?? `order ${orderId}`

  for (const [index, stop] of stops.entries()) {
    const position = index + 1
    for (const orderId of stop.order_ids) {
      const tons = tonsByOrder.get(orderId) ?? 0

      if (stop.stop_type === 'pickup') {
        if (picked.has(orderId)) {
          return `Stop ${position} picks up ${name(orderId)} a second time.`
        }
        load += tons
        if (load > capacityTons + 1e-6) {
          return (
            `After stop ${position} the truck would be carrying ` +
            `${round(load)}T, over its ${round(capacityTons)}T capacity. ` +
            `Deliver something before picking up ${name(orderId)}.`
          )
        }
        picked.add(orderId)
      } else {
        if (!picked.has(orderId)) {
          return (
            `Stop ${position} delivers ${name(orderId)} before it has been ` +
            `picked up. Move its pickup earlier.`
          )
        }
        load -= tons
      }
    }
  }
  return null
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
