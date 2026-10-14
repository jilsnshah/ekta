import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { usePaged } from '../../lib/usePaged'
import { fmtDay, fmtTons } from '../../lib/format'
import { STAGE_META } from '../../lib/stage'
import type { OrderStage } from '../../lib/types'
import { Link as RouterLink } from 'react-router-dom'
import { PickupWhen, Route } from '../../components/orderBits'
import { PortalPageHeader, StageBadge } from '../../components/portalShell'
import {
  EmptyState,
  FilterChip,
  KpiTile,
  LinkButton,
  Pagination,
  Panel,
  ResponsiveList,
  SearchInput,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
} from '../../components/ui'

const STAGE_FILTERS: OrderStage[] = ['placed', 'scheduled', 'in_transit', 'delivered']

export default function PortalOrders() {
  const [stage, setStage] = useState<OrderStage | null>(null)
  const [search, setSearch] = useState('')

  const summary = useQuery({
    queryKey: ['portal-summary'],
    queryFn: () => api.portal.summary(),
    refetchInterval: 30_000,
  })

  const list = usePaged({
    key: ['portal-orders'],
    filters: {
      stage: stage ?? undefined,
      search: search.trim() || undefined,
    },
    fetchPage: (params) => api.portal.orders(params),
    refetchInterval: 30_000,
  })

  const s = summary.data
  const rows = list.items

  // The chip counts are the summary figures, which the server computes over
  // all of this customer's orders rather than the page in hand.
  const counts: Partial<Record<OrderStage, number>> = {
    placed: s?.awaiting_truck,
    scheduled: s?.scheduled,
    in_transit: s?.in_transit,
    delivered: s?.delivered,
  }

  // "Has never placed an order" is the summary's total, not an empty page --
  // a search that matches nothing must not look like a first visit.
  const firstVisit = summary.isSuccess && s?.total === 0

  // Nobody's first sight of this should be an empty table. Explain the three
  // steps and give one obvious button.
  if (firstVisit) {
    return (
      <>
        <PortalPageHeader
          title="Welcome"
          subtitle="Place a transport order and follow it to delivery."
        />
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-ink">
            Getting your first order moving
          </h2>
          <ol className="mt-5 space-y-5">
            {[
              [
                'Tell us the company',
                'The name your bill should be in. You only do this once.',
              ],
              [
                'Tell us where and what',
                'Pickup and delivery addresses, the goods and the weight. We save the addresses for next time.',
              ],
              [
                'We take it from there',
                'We arrange a truck, and you can see the driver and follow every step here.',
              ],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-sm font-bold text-brand">
                  {index + 1}
                </span>
                <div>
                  <p className="text-base font-semibold text-ink">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <RouterLink
            to="/portal/new"
            className="mt-6 flex h-12 w-full items-center justify-center rounded-md border border-brand bg-brand text-base font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            Place your first order
          </RouterLink>
          <p className="mt-3 text-center text-sm text-ink-dim">
            It takes about a minute.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <PortalPageHeader
        title="My orders"
        subtitle="Every order you have placed, and where it has got to."
        actions={
          <>
            <LinkButton to="/portal/companies" className="max-sm:hidden">
              My companies
            </LinkButton>
            <LinkButton to="/portal/new" variant="primary">
              Place an order
            </LinkButton>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Waiting for a truck"
          value={s?.awaiting_truck ?? 0}
          sub="we are arranging these"
          tone={s?.awaiting_truck ? 'text-st-assigned' : undefined}
        />
        <KpiTile
          label="Truck arranged"
          value={s?.scheduled ?? 0}
          sub="ready to collect"
          tone={s?.scheduled ? 'text-st-transit' : undefined}
        />
        <KpiTile
          label="In transit"
          value={s?.in_transit ?? 0}
          sub="on the road"
          tone={s?.in_transit ? 'text-st-pickup' : undefined}
        />
        <KpiTile
          label="Delivered"
          value={s?.delivered ?? 0}
          sub={`${s?.total ?? 0} orders in total`}
          tone={s?.delivered ? 'text-st-available' : undefined}
        />
      </div>

      <Panel bodyClassName="overflow-visible">
        <div className="space-y-3 border-b border-line p-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by order number, goods or company"
            className="max-w-md"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={!stage} onClick={() => setStage(null)}>
              All
            </FilterChip>
            {STAGE_FILTERS.map((option) => (
              <FilterChip
                key={option}
                active={stage === option}
                onClick={() => setStage(stage === option ? null : option)}
                dot={STAGE_META[option].dot}
                count={counts[option]}
              >
                {STAGE_META[option].label}
              </FilterChip>
            ))}
          </div>
        </div>

        {list.isInitialLoading ? (
          <Spinner label="Loading your orders" />
        ) : rows.length === 0 ? (
          <EmptyState
            title={stage || search ? 'No orders match' : 'No orders yet'}
            hint={
              stage || search
                ? 'Clear the filters to see everything.'
                : 'Place your first order and track it here.'
            }
            action={
              stage || search ? undefined : (
                <LinkButton to="/portal/new" variant="primary">
                  Place an order
                </LinkButton>
              )
            }
          />
        ) : (
          <ResponsiveList
            breakpoint="xl"
            cards={
              <ul className="divide-y divide-line">
                {rows.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`/portal/orders/${order.id}`}
                      className="block px-4 py-4 transition-colors active:bg-surface-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold text-ink">
                            {order.code}
                          </p>
                          <p className="mt-0.5 truncate text-sm text-ink">
                            {order.material}
                            <span className="text-ink-dim">
                              {' · '}
                              {fmtTons(order.quantity_tons)}
                            </span>
                          </p>
                        </div>
                        <StageBadge stage={order.stage} size="sm" />
                      </div>

                      <div className="mt-2.5">
                        <Route from={order.pickup_name} to={order.drop_name} />
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-dim">
                        <span className="truncate">{order.company_name}</span>
                        {order.booked_by_us && <span>Booked by our team</span>}
                        <span>
                          Pickup <PickupWhen date={order.pickup_date} className="text-xs" />
                        </span>
                        {order.truck_registration && (
                          <span className="font-mono">{order.truck_registration}</span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            }
            table={
              <Table
                minWidth="58rem"
                head={
                  <>
                    <Th>Order</Th>
                    <Th>Billed to</Th>
                    <Th>Route</Th>
                    <Th align="right">Weight</Th>
                    <Th>Pickup</Th>
                    <Th>Progress</Th>
                    <Th>Truck</Th>
                  </>
                }
              >
                {rows.map((order) => (
                  <Tr key={order.id} to={`/portal/orders/${order.id}`}>
                    <Td>
                      <Link
                        to={`/portal/orders/${order.id}`}
                        className="font-mono text-sm font-semibold text-ink hover:text-brand"
                      >
                        {order.code}
                      </Link>
                      <div className="truncate text-xs text-ink-dim">
                        {order.order_number ? `${order.order_number} · ` : ''}
                        {order.material}
                      </div>
                    </Td>
                    <Td className="max-w-44">
                      <span className="block truncate">{order.company_name}</span>
                    </Td>
                    <Td className="max-w-52">
                      <Route from={order.pickup_name} to={order.drop_name} />
                    </Td>
                    <Td align="right" className="font-semibold tabular-nums">
                      {fmtTons(order.quantity_tons)}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <PickupWhen date={order.pickup_date} />
                      <div className="mt-0.5 text-xs text-ink-dim">{fmtDay(order.pickup_date)}</div>
                    </Td>
                    <Td>
                      <StageBadge stage={order.stage} size="sm" />
                    </Td>
                    <Td>
                      {order.truck_registration ? (
                        <span className="font-mono text-[0.8125rem] whitespace-nowrap">
                          {order.truck_registration}
                        </span>
                      ) : (
                        <span className="text-ink-dim">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Table>
            }
          />
        )}

        {rows.length > 0 && (
          <Pagination
            page={list.page}
            onPage={list.setPage}
            pageSize={list.pageSize}
            onPageSize={list.setPageSize}
            noun="orders"
            busy={list.isPlaceholderData}
          />
        )}
      </Panel>
    </>
  )
}
