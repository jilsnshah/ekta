import clsx from 'clsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { fmtDateTime, fmtDay, fmtTons } from '../../lib/format'
import { STAGE_STEPS, stageIndex } from '../../lib/stage'
import type { PortalOrder, PortalStop } from '../../lib/types'
import { PortalPageHeader, StageBadge } from '../../components/portalShell'
import { useToast } from '../../components/toast'
import {
  Button,
  Callout,
  EmptyState,
  Panel,
  Spinner,
} from '../../components/ui'

/** The four-step progress rail. Vertical on a phone, horizontal from sm up. */
function StageTracker({ order }: { order: PortalOrder }) {
  const current = stageIndex(order.stage)

  if (order.stage === 'cancelled') {
    return <Callout tone="warning">This order was cancelled.</Callout>
  }

  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:gap-2">
      {STAGE_STEPS.map((step, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={step.key} className="flex flex-1 gap-3 sm:flex-col sm:gap-2">
            {/* Phone: a vertical rail beside the label. */}
            <div className="flex flex-col items-center sm:hidden">
              <span
                className={clsx(
                  'grid size-6 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold',
                  done || active
                    ? 'border-brand bg-brand text-on-brand'
                    : 'border-line bg-surface-1 text-ink-dim',
                )}
              >
                {done ? '✓' : index + 1}
              </span>
              {index < STAGE_STEPS.length - 1 && (
                <span
                  className={clsx('w-0.5 flex-1 rounded', done ? 'bg-brand' : 'bg-line')}
                />
              )}
            </div>

            {/* sm and up: a horizontal bar above the label. */}
            <span
              className={clsx(
                'hidden h-1.5 rounded-full sm:block',
                done || active ? 'bg-brand' : 'bg-surface-3',
              )}
            />

            <div className={clsx('pb-5 sm:pb-0', index === STAGE_STEPS.length - 1 && 'pb-0')}>
              <p
                className={clsx(
                  'text-sm',
                  active
                    ? 'font-semibold text-brand'
                    : done
                      ? 'font-medium text-ink'
                      : 'text-ink-dim',
                )}
              >
                {step.label}
              </p>
              {active && (
                <p className="mt-0.5 text-xs text-ink-soft">{order.stage_detail}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** One of the party's own two legs. */
function StopRow({ stop, isLast }: { stop: PortalStop; isLast: boolean }) {
  const done = stop.status === 'completed'
  const isPickup = stop.stop_type === 'pickup'

  return (
    <li className="flex gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-col items-center">
        <span
          className={clsx(
            'grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold',
            done
              ? 'border-st-available bg-st-available text-on-brand'
              : 'border-line bg-surface-1 text-ink-dim',
          )}
        >
          {done ? '✓' : stop.sequence + 1}
        </span>
        {!isLast && (
          <span
            className={clsx(
              'mt-1.5 w-0.5 flex-1 rounded',
              done ? 'bg-st-available/35' : 'bg-line',
            )}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <span
          className={clsx(
            'inline-flex rounded-md border px-1.5 py-0.5 text-xs font-semibold',
            isPickup
              ? 'border-st-pickup/20 bg-st-pickup/10 text-st-pickup'
              : 'border-st-delivery/20 bg-st-delivery/10 text-st-delivery',
          )}
        >
          {isPickup ? 'Collection' : 'Delivery'}
        </span>
        <p className="mt-1.5 text-base font-semibold text-ink">{stop.place_name}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{stop.place_address}</p>
        <p
          className={clsx(
            'mt-1.5 text-xs',
            done ? 'font-medium text-st-available' : 'text-ink-dim',
          )}
        >
          {done ? `Done ${fmtDateTime(stop.completed_at)}` : 'Pending'}
        </p>
      </div>
    </li>
  )
}

export default function PortalOrderDetail() {
  const { id } = useParams()
  const orderId = Number(id)
  const queryClient = useQueryClient()
  const toast = useToast()

  const order = useQuery({
    queryKey: ['portal-order', orderId],
    queryFn: () => api.portal.order(orderId),
    enabled: Number.isFinite(orderId),
    refetchInterval: 30_000,
  })

  const cancel = useMutation({
    mutationFn: () => api.portal.cancelOrder(orderId),
    onSuccess: () => {
      toast.success('Order cancelled')
      void queryClient.invalidateQueries({ queryKey: ['portal-order', orderId] })
      void queryClient.invalidateQueries({ queryKey: ['portal-orders'] })
      void queryClient.invalidateQueries({ queryKey: ['portal-summary'] })
    },
    onError: (error) => toast.error('Could not cancel', (error as ApiError).message),
  })

  if (order.isLoading) return <Spinner label="Loading your order" />
  if (!order.data) return <EmptyState title="Order not found" />

  const o = order.data
  const canCancel = o.stage === 'placed'

  return (
    <>
      <PortalPageHeader
        back={{ to: '/portal', label: 'My orders' }}
        title={
          <>
            <span className="font-mono">{o.code}</span>
            <StageBadge stage={o.stage} />
          </>
        }
        subtitle={`${o.material} · ${fmtTons(o.quantity_tons)} · billed to ${o.company_name}`}
      />

      {o.booked_by_us && (
        <div className="mb-4">
          <Callout tone="info">
            Our team booked this for you. You can follow it here just like an order you place
            yourself.
          </Callout>
        </div>
      )}

      <div className="space-y-4">
        <Panel title="Progress" description={o.stage_detail}>
          <div className="p-4 sm:p-5">
            <StageTracker order={o} />
          </div>
        </Panel>

        {/* The carrier, as soon as the control room allocates one. */}
        <Panel title="Who is carrying it">
          {o.truck_registration ? (
            <div className="divide-y divide-line">
              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
                <div>
                  <span className="label">Truck</span>
                  <p className="mt-0.5 font-mono text-base font-semibold text-ink">
                    {o.truck_registration}
                  </p>
                  {o.truck_capacity_tons && (
                    <p className="text-xs text-ink-dim">
                      {fmtTons(o.truck_capacity_tons)} capacity
                    </p>
                  )}
                </div>
                <div>
                  <span className="label">Driver</span>
                  <p className="mt-0.5 text-base font-semibold text-ink">
                    {o.driver_name ?? 'To be confirmed'}
                  </p>
                </div>
              </div>
              {o.driver_phone && (
                <div className="p-4 sm:p-5">
                  {/* A full-width call button: the main thing wanted on a phone. */}
                  <a
                    href={`tel:${o.driver_phone.replace(/\s/g, '')}`}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-brand bg-brand text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover"
                  >
                    Call the driver · {o.driver_phone}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <Callout tone="info">
                We have not arranged a truck yet. The driver and vehicle will appear
                here as soon as we do.
              </Callout>
            </div>
          )}
        </Panel>

        <Panel
          title="Pickup and delivery"
          description={
            o.my_stops.length
              ? 'Updated as the driver completes each leg'
              : 'Set once a truck is allocated'
          }
        >
          {o.my_stops.length === 0 ? (
            <div className="divide-y divide-line">
              <div className="p-4 sm:p-5">
                <span className="label text-st-pickup">Collection</span>
                <p className="mt-1.5 text-base font-semibold text-ink">{o.pickup_name}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
                  {o.pickup_address}
                </p>
                {o.pickup_phone && (
                  <a
                    href={`tel:${o.pickup_phone.replace(/\s/g, '')}`}
                    className="mt-1 inline-block text-sm font-medium text-brand hover:underline"
                  >
                    {o.pickup_phone}
                  </a>
                )}
              </div>
              <div className="p-4 sm:p-5">
                <span className="label text-st-delivery">Delivery</span>
                <p className="mt-1.5 text-base font-semibold text-ink">{o.drop_name}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
                  {o.drop_address}
                </p>
                {o.drop_phone && (
                  <a
                    href={`tel:${o.drop_phone.replace(/\s/g, '')}`}
                    className="mt-1 inline-block text-sm font-medium text-brand hover:underline"
                  >
                    {o.drop_phone}
                  </a>
                )}
              </div>
            </div>
          ) : (
            <ol>
              {o.my_stops.map((stop, index) => (
                <StopRow
                  key={`${stop.stop_type}-${stop.sequence}`}
                  stop={stop}
                  isLast={index === o.my_stops.length - 1}
                />
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Order details">
          <dl className="divide-y divide-line text-sm">
            {[
              ['Billed to', o.company_name],
              ['Your order no.', o.order_number ?? '—'],
              ['Material', o.material],
              ['Weight', fmtTons(o.quantity_tons)],
              ['Pickup day you asked for', fmtDay(o.pickup_date)],
              ['Placed', fmtDateTime(o.created_at)],
              ...(o.assigned_at ? [['Truck arranged', fmtDateTime(o.assigned_at)]] : []),
              ...(o.picked_up_at ? [['Collected', fmtDateTime(o.picked_up_at)]] : []),
              ...(o.delivered_at ? [['Delivered', fmtDateTime(o.delivered_at)]] : []),
            ].map(([label, value]) => (
              <div
                key={label as string}
                className="flex items-baseline justify-between gap-4 px-4 py-3 sm:px-5"
              >
                <dt className="shrink-0 text-ink-dim">{label}</dt>
                <dd className="text-right font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          {o.special_instructions && (
            <div className="border-t border-line p-4 sm:p-5">
              <span className="label">Special instructions</span>
              <p className="mt-1 text-sm text-ink">{o.special_instructions}</p>
            </div>
          )}
        </Panel>

        {canCancel && (
          <Panel title="Need to change something?">
            <div className="p-4 sm:p-5">
              <p className="text-sm text-ink-soft">
                You can cancel while the order is still waiting for a truck. Once one is
                arranged, please call us instead.
              </p>
              <Button
                variant="danger"
                className="mt-3 h-11 w-full sm:h-9 sm:w-auto"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {cancel.isPending ? 'Cancelling…' : 'Cancel this order'}
              </Button>
            </div>
          </Panel>
        )}
      </div>
    </>
  )
}
