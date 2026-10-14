import type { OrderStage } from './types'

/**
 * The party-facing view of an order's progress. Four plain steps instead of
 * the eight internal statuses, so a customer does not need the operations
 * vocabulary to read it.
 */
export const STAGE_STEPS: { key: OrderStage; label: string }[] = [
  { key: 'placed', label: 'Order placed' },
  { key: 'scheduled', label: 'Truck arranged' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
]

export const STAGE_META: Record<
  OrderStage,
  { label: string; chip: string; dot: string }
> = {
  placed: {
    label: 'Awaiting truck',
    chip: 'bg-st-assigned/10 text-st-assigned',
    dot: 'bg-st-assigned',
  },
  scheduled: {
    label: 'Truck arranged',
    chip: 'bg-st-transit/10 text-st-transit',
    dot: 'bg-st-transit',
  },
  in_transit: {
    label: 'In transit',
    chip: 'bg-st-pickup/10 text-st-pickup',
    dot: 'bg-st-pickup',
  },
  delivered: {
    label: 'Delivered',
    chip: 'bg-st-available/10 text-st-available',
    dot: 'bg-st-available',
  },
  cancelled: {
    label: 'Cancelled',
    chip: 'bg-st-muted/10 text-st-muted',
    dot: 'bg-st-muted',
  },
}

/** How far along the four steps a stage sits; -1 for cancelled. */
export function stageIndex(stage: OrderStage): number {
  return STAGE_STEPS.findIndex((step) => step.key === stage)
}
