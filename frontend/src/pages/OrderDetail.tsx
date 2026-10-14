import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { fmtDate, fmtDateTime, fmtDay, fmtDayRelative, fmtTons, pickupRisk } from '../lib/format'
import { MetaItem, PageHeader } from '../components/shell'
import {
  Callout,
  EmptyState,
  LinkButton,
  OrderStatusBadge,
  Panel,
  Spinner,
  Stat,
} from '../components/ui'

const TIMELINE: { key: string; label: string }[] = [
  { key: 'created_at', label: 'Order received' },
  { key: 'assigned_at', label: 'Assigned to a truck' },
  { key: 'picked_up_at', label: 'Picked up' },
  { key: 'delivered_at', label: 'Delivered' },
]

/** Pickup and drop, side by side: name, phone and the full typed address. */
function PlaceCard({
  kind,
  name,
  phone,
  address,
}: {
  kind: 'pickup' | 'drop'
  name: string
  phone: string | null
  address: string
}) {
  const accent = kind === 'pickup' ? 'text-st-pickup' : 'text-st-delivery'
  return (
    <div className="flex-1 p-5">
      <p className={`label ${accent}`}>{kind === 'pickup' ? 'Pickup' : 'Drop'}</p>
      <p className="mt-1.5 text-base font-semibold text-ink">{name}</p>
      {phone ? (
        <a
          href={`tel:${phone.replace(/\s/g, '')}`}
          className="mt-0.5 inline-block text-sm font-medium text-brand hover:underline"
        >
          {phone}
        </a>
      ) : (
        <p className="mt-0.5 text-sm text-ink-dim">No phone number</p>
      )}
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
        {address}
      </p>
    </div>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const orderId = Number(id)

  const order = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.order(orderId),
    enabled: Number.isFinite(orderId),
  })

  if (order.isLoading) return <Spinner label="Loading order" />
  if (!order.data) return <EmptyState title="Order not found" />

  const o = order.data
  const risk = pickupRisk(o.pickup_date)
  const notCollected = o.picked_up_at === null && o.status !== 'cancelled'

  return (
    <div className="p-6">
      <PageHeader
        back={{ to: '/orders', label: 'All orders' }}
        title={
          <>
            <span className="font-mono">{o.code}</span>
            <OrderStatusBadge status={o.status} />
          </>
        }
        subtitle={`${o.material} · ${fmtTons(o.quantity_tons)} for ${o.billing_party}`}
        meta={
          <>
            {o.order_number && <MetaItem label="Order no.">{o.order_number}</MetaItem>}
            <MetaItem label="Route">
              {o.pickup_name} → {o.drop_name}
            </MetaItem>
            <MetaItem label="Pickup">{fmtDay(o.pickup_date)}</MetaItem>
          </>
        }
        actions={
          o.trip_id ? (
            <LinkButton to={`/trips/${o.trip_id}`} variant="primary">
              Open {o.trip_code}
            </LinkButton>
          ) : (
            <LinkButton to="/assign" variant="primary">
              Assign to a truck
            </LinkButton>
          )
        }
      />

      {risk === 'overdue' && notCollected && (
        <div className="mb-4">
          <Callout tone="danger">
            Pickup was due {fmtDayRelative(o.pickup_date).toLowerCase()} and the goods have
            not been collected.
          </Callout>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_21rem]">
        <div className="space-y-4">
          <Panel title="Pickup and drop" bodyClassName="">
            <div className="flex flex-col divide-y divide-line sm:flex-row sm:divide-x sm:divide-y-0">
              <PlaceCard
                kind="pickup"
                name={o.pickup_name}
                phone={o.pickup_phone}
                address={o.pickup_address}
              />
              <PlaceCard
                kind="drop"
                name={o.drop_name}
                phone={o.drop_phone}
                address={o.drop_address}
              />
            </div>
          </Panel>

          <Panel title="Consignment">
            <div className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
              <Stat label="Billing party" value={o.billing_party} />
              <Stat label="Order no." value={o.order_number ?? '—'} mono />
              <Stat label="Material" value={o.material} />
              <Stat label="Weight" value={fmtTons(o.quantity_tons)} mono />
              <Stat label="Pickup date" value={fmtDay(o.pickup_date)} />
              <Stat label="Order received" value={fmtDate(o.created_at)} />
              <Stat
                label="Raised by"
                value={
                  o.source === 'portal'
                    ? `Customer portal${o.placed_by_phone ? ` · ${o.placed_by_phone}` : ''}`
                    : 'Control room'
                }
              />
            </div>
            {o.special_instructions && (
              <div className="border-t border-line px-5 py-4">
                <span className="label">Special instructions</span>
                <p className="mt-1 text-sm text-ink">{o.special_instructions}</p>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Assignment">
            <div className="space-y-4 p-5">
              <Stat
                label="Truck"
                value={
                  o.truck_id ? (
                    <Link
                      to={`/trucks/${o.truck_id}`}
                      className="font-mono font-medium text-brand hover:underline"
                    >
                      {o.truck_registration}
                    </Link>
                  ) : (
                    <span className="text-ink-dim">Not assigned</span>
                  )
                }
              />
              <Stat
                label="Trip"
                value={
                  o.trip_id ? (
                    <Link
                      to={`/trips/${o.trip_id}`}
                      className="font-mono font-medium text-brand hover:underline"
                    >
                      {o.trip_code}
                    </Link>
                  ) : (
                    <span className="text-ink-dim">—</span>
                  )
                }
              />
              <Link
                to={`/orders?billing_party=${encodeURIComponent(o.billing_party)}`}
                className="block text-sm font-medium text-brand hover:underline"
              >
                All orders for {o.billing_party}
              </Link>
            </div>
          </Panel>

          <Panel title="Progress">
            <ol className="p-5">
              {TIMELINE.map((step, index) => {
                const value = o[step.key as keyof typeof o] as string | null
                const done = Boolean(value)
                return (
                  <li key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={
                          done
                            ? 'mt-1 size-2.5 shrink-0 rounded-full bg-st-available'
                            : 'mt-1 size-2.5 shrink-0 rounded-full border-2 border-line bg-surface-1'
                        }
                      />
                      {index < TIMELINE.length - 1 && (
                        <span
                          className={
                            done ? 'w-px flex-1 bg-st-available/40' : 'w-px flex-1 bg-line'
                          }
                        />
                      )}
                    </div>
                    <div className="pb-5 last:pb-0">
                      <p
                        className={
                          done ? 'text-sm font-medium text-ink' : 'text-sm text-ink-dim'
                        }
                      >
                        {step.label}
                      </p>
                      <p className="text-xs text-ink-dim">
                        {done ? fmtDateTime(value) : 'Pending'}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  )
}
