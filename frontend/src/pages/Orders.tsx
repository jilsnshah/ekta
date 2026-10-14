import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtDay, fmtTons } from '../lib/format'
import { ORDER_STATUS, ORDER_STATUS_ORDER } from '../lib/status'
import type { Order, OrderStatus } from '../lib/types'
import {
  IconAssign,
  IconOrders,
  IconPlus,
} from '../components/icons'
import { NewOrderModal } from '../components/newOrderModal'
import { PickupWhen, Route } from '../components/orderBits'
import { MetaItem, PageBody, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Button,
  Callout,
  ChipBar,
  Code,
  EmptyState,
  FilterChip,
  LinkButton,
  ListCard,
  OrderStatusBadge,
  Pagination,
  Panel,
  Pill,
  ResponsiveList,
  SearchInput,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
} from '../components/ui'

/* -------------------------------- page ----------------------------------- */

/** The billing party, linked to the customer the order belongs to. */
function PartyLink({ order }: { order: Order }) {
  if (!order.customer_id) return <>{order.billing_party}</>
  return (
    <Link to={`/customers/${order.customer_id}`} className="hover:text-brand hover:underline">
      {order.billing_party}
    </Link>
  )
}

export default function Orders() {
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const toast = useToast()
  const queryClient = useQueryClient()

  const statusParam = params.get('status') as OrderStatus | null
  const partyParam = params.get('billing_party')

  // Status, party and search are all server-side, so the page is a real
  // window onto the whole table rather than a filtered first page.
  const list = usePaged({
    key: ['orders'],
    filters: {
      status: statusParam ? [statusParam] : undefined,
      billing_party: partyParam ?? undefined,
      search: search.trim() || undefined,
    },
    fetchPage: (params) => api.orders(params),
    refetchInterval: 60_000,
  })

  // The chips and the cargo total count every matching order, not the 25 on
  // screen. The status filter is left out on purpose: a chip has to show what
  // selecting it would find.
  const stats = useQuery({
    queryKey: ['orders', 'stats', partyParam, search.trim()],
    queryFn: () =>
      api.orderStats({
        billing_party: partyParam ?? undefined,
        search: search.trim() || undefined,
      }),
    refetchInterval: 60_000,
  })

  const unassign = useMutation({
    mutationFn: (orderId: number) => api.unassign(orderId),
    onSuccess: (result) => {
      toast.success(
        'Order unassigned',
        `${result.truck.registration_number} is now carrying ` +
          `${fmtTons(result.capacity.current_load_tons)} of ${fmtTons(result.capacity.capacity_tons)}`,
      )
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['board'] })
      void queryClient.invalidateQueries({ queryKey: ['trucks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error) => {
      const payload = (error as ApiError).payload as
        | { detail?: { message?: string } }
        | undefined
      toast.error('Could not unassign', payload?.detail?.message ?? (error as Error).message)
    },
  })

  const counts = stats.data?.by_status ?? {}
  const rows = list.items

  const setStatus = (status: OrderStatus | null) => {
    const next = new URLSearchParams(params)
    if (status) next.set('status', status)
    else next.delete('status')
    setParams(next, { replace: true })
  }

  // Tonnage for whatever is selected: one status, or everything.
  const totalTons = statusParam
    ? stats.data?.tons_by_status[statusParam] ?? 0
    : stats.data?.total_tons ?? 0

  const canUnassign = (order: Order) =>
    order.truck_id !== null && order.picked_up_at === null && order.status !== 'delivered'

  return (
    <PageBody>
      <PageHeader
        title="Orders"
        subtitle="Every consignment, from intake to delivery."
        meta={
          <>
            <MetaItem label="Matching">{list.page.total.toLocaleString('en-IN')}</MetaItem>
            <MetaItem label="Cargo">{fmtTons(totalTons)}</MetaItem>
          </>
        }
        actions={
          <>
            <LinkButton to="/assign" className="max-sm:hidden">
              <IconAssign size={16} />
              Assignment board
            </LinkButton>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <IconPlus size={17} />
              New order
            </Button>
          </>
        }
      />

      {partyParam && (
        <div className="mb-4">
          <Callout tone="info">
            Showing orders for <span className="font-semibold text-ink">{partyParam}</span>.{' '}
            <button
              onClick={() => {
                const next = new URLSearchParams(params)
                next.delete('billing_party')
                setParams(next, { replace: true })
              }}
              className="font-medium text-brand hover:underline"
            >
              Show every party
            </button>
          </Callout>
        </div>
      )}

      <Panel bodyClassName="overflow-visible">
        <div className="space-y-3 border-b border-line p-4 sm:px-5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search order no., material, party or place"
            className="lg:max-w-md"
          />
          <ChipBar>
            <FilterChip
              active={!statusParam}
              onClick={() => setStatus(null)}
              count={stats.data?.total}
            >
              All
            </FilterChip>
            {ORDER_STATUS_ORDER.map((status) => {
              const meta = ORDER_STATUS[status]
              return (
                <FilterChip
                  key={status}
                  active={statusParam === status}
                  onClick={() => setStatus(statusParam === status ? null : status)}
                  dot={meta.dot}
                  count={counts[status]}
                >
                  {meta.label}
                </FilterChip>
              )
            })}
          </ChipBar>
        </div>

        {list.isInitialLoading ? (
          <Spinner label="Loading orders" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<IconOrders size={20} />}
            title="No orders match"
            hint="Try a different status or clear the search."
          />
        ) : (
          <>
            <ResponsiveList
      breakpoint="xl"
              cards={
                <ul className="divide-y divide-line">
                  {rows.map((order) => (
                    <ListCard key={order.id} to={`/orders/${order.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Code to={`/orders/${order.id}`} className="font-semibold">
                            {order.code}
                          </Code>
                          <p className="mt-0.5 truncate text-sm text-ink">
                            {order.material}
                            <span className="text-ink-dim">
                              {' · '}
                              {fmtTons(order.quantity_tons)}
                            </span>
                          </p>
                        </div>
                        <OrderStatusBadge status={order.status} size="sm" />
                      </div>
                      <div className="mt-2.5">
                        <Route from={order.pickup_name} to={order.drop_name} />
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-dim">
                        <span className="truncate">{order.billing_party}</span>
                        <span>
                          Pickup <PickupWhen date={order.pickup_date} className="text-xs" />
                        </span>
                        {order.truck_registration && (
                          <span className="font-mono">{order.truck_registration}</span>
                        )}
                      </div>
                    </ListCard>
                  ))}
                </ul>
              }
              table={
                <Table
                  minWidth="52rem"
                  head={
                    <>
                      <Th>Order</Th>
                      <Th className="hidden 2xl:table-cell">Billing party</Th>
                      <Th>Route</Th>
                      <Th align="right">Weight</Th>
                      <Th>Pickup</Th>
                      <Th>Status</Th>
                      <Th>Truck</Th>
                      <Th className="w-0" />
                    </>
                  }
                >
                  {rows.map((order) => (
                    <Tr key={order.id} to={`/orders/${order.id}`}>
                      <Td className="max-w-44">
                        <Code to={`/orders/${order.id}`} className="font-semibold">
                          {order.code}
                        </Code>
                        <div className="mt-0.5 truncate text-xs text-ink-dim">
                          {order.order_number ? `${order.order_number} · ` : ''}
                          {order.material}
                        </div>
                        {/* Folded in here until there is room for its own column. */}
                        <div className="mt-0.5 truncate text-xs text-ink-soft 2xl:hidden">
                          <PartyLink order={order} />
                        </div>
                      </Td>

                      <Td className="hidden max-w-40 2xl:table-cell">
                        <span className="block truncate text-ink">
                          <PartyLink order={order} />
                        </span>
                        {order.source === 'portal' && (
                          <Pill className="mt-1">Customer portal</Pill>
                        )}
                      </Td>

                      <Td className="max-w-48">
                        <Route from={order.pickup_name} to={order.drop_name} />
                      </Td>

                      <Td align="right" className="font-semibold tabular-nums">
                        {fmtTons(order.quantity_tons)}
                      </Td>

                      <Td className="whitespace-nowrap">
                        <PickupWhen date={order.pickup_date} />
                        <div className="mt-0.5 text-xs text-ink-dim">
                          {fmtDay(order.pickup_date)}
                        </div>
                      </Td>

                      <Td>
                        <OrderStatusBadge status={order.status} size="sm" />
                      </Td>

                      <Td>
                        {order.truck_id ? (
                          <div className="min-w-0">
                            <Code to={`/trucks/${order.truck_id}`}>
                              {order.truck_registration}
                            </Code>
                          </div>
                        ) : (
                          <span className="text-sm text-ink-dim">Not assigned</span>
                        )}
                      </Td>

                      <Td align="right">
                        {canUnassign(order) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => unassign.mutate(order.id)}
                            disabled={unassign.isPending && unassign.variables === order.id}
                          >
                            {unassign.isPending && unassign.variables === order.id
                              ? 'Unassigning…'
                              : 'Unassign'}
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </Table>
              }
            />
            <Pagination
              page={list.page}
              onPage={list.setPage}
              pageSize={list.pageSize}
              onPageSize={list.setPageSize}
              noun="orders"
              busy={list.isPlaceholderData}
            />
          </>
        )}
      </Panel>

      <NewOrderModal open={creating} onClose={() => setCreating(false)} />
    </PageBody>
  )
}
