import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtDay, fmtDayRelative, fmtTons, pickupRisk } from '../lib/format'
import { ORDER_STATUS, ORDER_STATUS_ORDER } from '../lib/status'
import type { Order, OrderStatus } from '../lib/types'
import {
  EMPTY_PLACE,
  PlacePicker,
  placeIsComplete,
  type PlaceValue,
} from '../components/placePicker'
import { MetaItem, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Button,
  Callout,
  CellStack,
  EmptyState,
  Field,
  FilterChip,
  LinkButton,
  Modal,
  OrderStatusBadge,
  Pagination,
  Panel,
  Pill,
  SearchInput,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
  inputClass,
  textareaClass,
} from '../components/ui'

/* ------------------------------- new order ------------------------------- */

function todayIso(offsetDays = 1): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function NewOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const parties = useQuery({
    queryKey: ['billing-parties'],
    queryFn: () => api.billingParties(),
    enabled: open,
  })
  // Its own book first, then every customer's -- the control room often
  // raises an order for a godown the customer already saved. Searched on the
  // server, so a book of thousands is still reachable from here.
  const [placeSearch, setPlaceSearch] = useState('')
  const places = useQuery({
    queryKey: ['places', placeSearch.trim()],
    queryFn: () =>
      api.places({ search: placeSearch.trim() || undefined, page_size: 25 }),
    enabled: open,
  })

  const [form, setForm] = useState({
    billing_party: '',
    order_number: '',
    material: '',
    quantity_tons: '',
    pickup_date: todayIso(1),
    special_instructions: '',
  })
  const [pickup, setPickup] = useState<PlaceValue>(EMPTY_PLACE)
  const [drop, setDrop] = useState<PlaceValue>(EMPTY_PLACE)

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const create = useMutation({
    mutationFn: () =>
      api.createOrder({
        billing_party: form.billing_party.trim(),
        order_number: form.order_number.trim() || null,
        material: form.material.trim(),
        quantity_tons: Number(form.quantity_tons),
        pickup_name: pickup.label.trim(),
        pickup_phone: pickup.phone.trim() || null,
        pickup_address: pickup.address.trim(),
        drop_name: drop.label.trim(),
        drop_phone: drop.phone.trim() || null,
        drop_address: drop.address.trim(),
        pickup_date: form.pickup_date,
        special_instructions: form.special_instructions.trim() || null,
      }),
    onSuccess: (order) => {
      toast.success(
        `${order.code} created`,
        `${order.material} · ${fmtTons(order.quantity_tons)} for ${order.billing_party}`,
      )
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['board'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['billing-parties'] })
      void queryClient.invalidateQueries({ queryKey: ['places'] })
      onClose()
    },
    onError: (error) => toast.error('Could not create the order', (error as ApiError).message),
  })

  const ready =
    form.billing_party.trim() &&
    form.material.trim() &&
    Number(form.quantity_tons) > 0 &&
    form.pickup_date &&
    placeIsComplete(pickup) &&
    placeIsComplete(drop)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New transport order"
      description="Weight is in tons, which is what the capacity check uses."
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Creating…' : 'Create order'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Billing party" hint="Type a new name or pick one already on file.">
            <input
              value={form.billing_party}
              onChange={(event) => set('billing_party', event.target.value)}
              list="billing-parties"
              placeholder="ABC Industries"
              className={inputClass}
            />
            <datalist id="billing-parties">
              {(parties.data ?? []).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>

          <Field label="Order no." hint="Optional — the party's own reference.">
            <input
              value={form.order_number}
              onChange={(event) => set('order_number', event.target.value)}
              placeholder="PO-7781"
              className={inputClass}
            />
          </Field>

          <Field label="Material">
            <input
              value={form.material}
              onChange={(event) => set('material', event.target.value)}
              placeholder="Steel rods"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantity (tons)">
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={form.quantity_tons}
                onChange={(event) => set('quantity_tons', event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Pickup date">
              <input
                type="date"
                value={form.pickup_date}
                onChange={(event) => set('pickup_date', event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        <fieldset className="rounded-lg border border-line p-4">
          <legend className="label px-1">Pickup</legend>
          <PlacePicker
            saved={places.data?.items ?? []}
            value={pickup}
            onChange={setPickup}
            newLabelHint="Saved to the address book for next time."
            idPrefix="admin-pickup"
            search={placeSearch}
            onSearch={setPlaceSearch}
            total={places.data?.total}
          />
        </fieldset>

        <fieldset className="rounded-lg border border-line p-4">
          <legend className="label px-1">Drop</legend>
          <PlacePicker
            saved={places.data?.items ?? []}
            value={drop}
            onChange={setDrop}
            newLabelHint="Saved to the address book for next time."
            idPrefix="admin-drop"
            search={placeSearch}
            onSearch={setPlaceSearch}
            total={places.data?.total}
          />
        </fieldset>

        <Field label="Special instructions">
          <textarea
            rows={2}
            value={form.special_instructions}
            onChange={(event) => set('special_instructions', event.target.value)}
            className={textareaClass}
          />
        </Field>
      </div>
    </Modal>
  )
}

/* -------------------------------- page ----------------------------------- */

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

  return (
    <div className="p-6">
      <PageHeader
        title="Transport orders"
        subtitle="Every consignment, from intake to delivery."
        meta={
          <>
            <MetaItem label="Showing">
              {list.page.total.toLocaleString()} orders
            </MetaItem>
            <MetaItem label="Total cargo">{fmtTons(totalTons)}</MetaItem>
          </>
        }
        actions={
          <>
            <LinkButton to="/assign">Assignment board</LinkButton>
            <Button variant="primary" onClick={() => setCreating(true)}>
              New order
            </Button>
          </>
        }
      />

      {partyParam && (
        <div className="mb-4">
          <Callout tone="info">
            Filtered to {partyParam}.{' '}
            <button
              onClick={() => {
                const next = new URLSearchParams(params)
                next.delete('billing_party')
                setParams(next, { replace: true })
              }}
              className="font-medium text-brand hover:underline"
            >
              Show all parties
            </button>
          </Callout>
        </div>
      )}

      <Panel bodyClassName="overflow-visible">
        <div className="space-y-3 border-b border-line p-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search order no., material, billing party or truck"
            className="max-w-md"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={!statusParam} onClick={() => setStatus(null)}>
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
          </div>
        </div>

        {list.isInitialLoading ? (
          <Spinner label="Loading orders" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No orders match"
            hint="Try a different status or clear the search."
          />
        ) : (
          <>
          <Table
            minWidth="68rem"
            head={
              <>
                <Th>Order</Th>
                <Th>Billing party</Th>
                <Th align="right">Weight</Th>
                <Th>Pickup</Th>
                <Th>Drop</Th>
                <Th align="right">Pickup date</Th>
                <Th>Status</Th>
                <Th>Assigned to</Th>
                <Th />
              </>
            }
          >
            {rows.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                onUnassign={() => unassign.mutate(order.id)}
                unassigning={unassign.isPending && unassign.variables === order.id}
              />
            ))}
          </Table>
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
    </div>
  )
}

function OrderRow({
  order,
  onUnassign,
  unassigning,
}: {
  order: Order
  onUnassign: () => void
  unassigning: boolean
}) {
  const risk = pickupRisk(order.pickup_date)
  const canUnassign =
    order.truck_id !== null && order.picked_up_at === null && order.status !== 'delivered'

  return (
    <Tr to={`/orders/${order.id}`}>
      <Td>
        <Link
          to={`/orders/${order.id}`}
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
        <span className="block truncate text-ink">{order.billing_party}</span>
        {order.source === 'portal' && (
          <span className="mt-0.5 inline-block">
            <Pill>Placed by customer</Pill>
          </span>
        )}
      </Td>

      <Td align="right" className="font-medium tabular-nums">
        {fmtTons(order.quantity_tons)}
      </Td>

      <Td className="max-w-48">
        <CellStack primary={order.pickup_name} secondary={order.pickup_phone ?? undefined} />
      </Td>

      <Td className="max-w-48">
        <CellStack primary={order.drop_name} secondary={order.drop_phone ?? undefined} />
      </Td>

      <Td align="right">
        <div
          className={
            risk === 'overdue'
              ? 'font-semibold text-st-delayed'
              : risk === 'soon'
                ? 'font-medium text-st-pickup'
                : 'text-ink'
          }
        >
          {fmtDayRelative(order.pickup_date)}
        </div>
        <div className="text-xs text-ink-dim">{fmtDay(order.pickup_date)}</div>
      </Td>

      <Td>
        <OrderStatusBadge status={order.status} size="sm" />
      </Td>

      <Td>
        {order.truck_id ? (
          <CellStack
            primary={
              <Link to={`/trucks/${order.truck_id}`} className="font-mono hover:text-brand">
                {order.truck_registration}
              </Link>
            }
            secondary={
              order.trip_id ? (
                <Link to={`/trips/${order.trip_id}`} className="hover:text-brand">
                  {order.trip_code}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <span className="text-ink-dim">—</span>
        )}
      </Td>

      <Td align="right">
        {canUnassign && (
          <Button size="sm" variant="ghost" onClick={onUnassign} disabled={unassigning}>
            {unassigning ? '…' : 'Unassign'}
          </Button>
        )}
      </Td>
    </Tr>
  )
}
