import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { fmtDate, fmtDateTime, fmtDay, fmtDayRelative, fmtTons, pickupRisk } from '../lib/format'
import { IconArrowRight, IconAssign, IconOrders, IconPhone, IconTrips } from '../components/icons'
import { Milestones, PlaceBlock } from '../components/orderBits'
import { PageBody, PageHeader } from '../components/shell'
import {
  Avatar,
  Callout,
  Code,
  EmptyState,
  FactList,
  LinkButton,
  OrderStatusBadge,
  Panel,
  Spinner,
} from '../components/ui'

export default function OrderDetail() {
  const { id } = useParams()
  const orderId = Number(id)

  const order = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.order(orderId),
    enabled: Number.isFinite(orderId),
  })

  if (order.isLoading)
    return (
      <PageBody>
        <Spinner label="Loading order" />
      </PageBody>
    )
  if (!order.data)
    return (
      <PageBody>
        <EmptyState icon={<IconOrders size={20} />} title="Order not found" />
      </PageBody>
    )

  const o = order.data
  const risk = pickupRisk(o.pickup_date)
  const notCollected = o.picked_up_at === null && o.status !== 'cancelled'

  return (
    <PageBody>
      <PageHeader
        back={{ to: '/orders', label: 'Orders' }}
        eyebrow="Transport order"
        title={
          <>
            <span className="font-mono tracking-tight">{o.code}</span>
            <OrderStatusBadge status={o.status} />
          </>
        }
        subtitle={
          <>
            <span className="font-medium text-ink">{o.material}</span> ·{' '}
            {fmtTons(o.quantity_tons)} for{' '}
            <Link
              to={
                o.customer_id
                  ? `/customers/${o.customer_id}`
                  : `/orders?billing_party=${encodeURIComponent(o.billing_party)}`
              }
              className="font-medium text-ink hover:text-brand"
            >
              {o.billing_party}
            </Link>
          </>
        }
        actions={
          o.trip_id ? (
            <LinkButton to={`/trips/${o.trip_id}`} variant="primary">
              <IconTrips size={16} />
              Open {o.trip_code}
            </LinkButton>
          ) : (
            <LinkButton to="/assign" variant="primary">
              <IconAssign size={16} />
              Assign to a truck
            </LinkButton>
          )
        }
      />

      {risk === 'overdue' && notCollected && (
        <div className="mb-4">
          <Callout tone="danger">
            Pickup was due {fmtDayRelative(o.pickup_date).toLowerCase()} and the goods have not
            been collected.
          </Callout>
        </div>
      )}

      <section className="card mb-4 p-5 sm:p-6">
        <Milestones
          steps={[
            { label: 'Order received', at: o.created_at ? fmtDateTime(o.created_at) : null },
            { label: 'Truck assigned', at: o.assigned_at ? fmtDateTime(o.assigned_at) : null },
            { label: 'Picked up', at: o.picked_up_at ? fmtDateTime(o.picked_up_at) : null },
            { label: 'Delivered', at: o.delivered_at ? fmtDateTime(o.delivered_at) : null },
          ]}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-stretch sm:gap-0 sm:p-0">
              <div className="sm:flex-1 sm:p-6">
                <PlaceBlock
                  kind="pickup"
                  name={o.pickup_name}
                  phone={o.pickup_phone}
                  address={o.pickup_address}
                />
              </div>
              <div className="hidden items-center sm:flex" aria-hidden>
                <span className="grid size-9 place-items-center rounded-full border border-line bg-surface-1 text-ink-dim shadow-button">
                  <IconArrowRight size={16} />
                </span>
              </div>
              <div className="border-t border-line pt-6 sm:flex-1 sm:border-t-0 sm:p-6">
                <PlaceBlock
                  kind="drop"
                  name={o.drop_name}
                  phone={o.drop_phone}
                  address={o.drop_address}
                />
              </div>
            </div>
          </section>

          {o.special_instructions && (
            <Callout tone="warning">
              <span className="font-semibold">Special instructions. </span>
              {o.special_instructions}
            </Callout>
          )}
        </div>

        <div className="space-y-4">
          {o.customer_id && (
            <Panel title="Customer" bodyClassName="">
              <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
                <Avatar name={o.customer_name ?? o.customer_phone} size={40} tone="brand" />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/customers/${o.customer_id}`}
                    className="block truncate font-semibold text-ink hover:text-brand"
                  >
                    {o.customer_name ?? 'Customer'}
                  </Link>
                  <p className="truncate font-mono text-xs text-ink-dim">{o.customer_phone}</p>
                </div>
                {o.customer_phone && (
                  <a
                    href={`tel:${o.customer_phone.replace(/\s/g, '')}`}
                    aria-label="Call the customer"
                    className="grid size-10 place-items-center rounded-full bg-st-available/10 text-st-available transition-colors hover:bg-st-available/20"
                  >
                    <IconPhone size={18} />
                  </a>
                )}
              </div>
              <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-dim sm:px-5">
                They see this order in the customer portal, whoever raised it.
              </p>
            </Panel>
          )}

          <Panel title="Consignment" bodyClassName="">
            <FactList
              items={[
                { label: 'Billing party', value: o.billing_party },
                o.order_number ? { label: 'Order no.', value: o.order_number, mono: true } : null,
                { label: 'Material', value: o.material },
                { label: 'Weight', value: fmtTons(o.quantity_tons) },
                { label: 'Pickup date', value: fmtDay(o.pickup_date) },
                { label: 'Received', value: fmtDate(o.created_at) },
                {
                  label: 'Raised by',
                  value:
                    o.source === 'portal'
                      ? `Customer portal${o.placed_by_phone ? ` · ${o.placed_by_phone}` : ''}`
                      : 'Control room',
                },
              ]}
            />
          </Panel>

          <Panel title="Assignment" bodyClassName="">
            <FactList
              items={[
                {
                  label: 'Truck',
                  value: o.truck_id ? (
                    <Code to={`/trucks/${o.truck_id}`} className="text-brand">
                      {o.truck_registration}
                    </Code>
                  ) : (
                    <span className="font-normal text-ink-dim">Not assigned</span>
                  ),
                },
                {
                  label: 'Trip',
                  value: o.trip_id ? (
                    <Code to={`/trips/${o.trip_id}`} className="text-brand">
                      {o.trip_code}
                    </Code>
                  ) : (
                    <span className="font-normal text-ink-dim">None yet</span>
                  ),
                },
              ]}
            />
            <div className="border-t border-line px-4 py-3 sm:px-5">
              <Link
                to={`/orders?billing_party=${encodeURIComponent(o.billing_party)}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                Every order for {o.billing_party}
                <IconArrowRight size={14} />
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </PageBody>
  )
}
