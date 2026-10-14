import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { fmtDay, fmtDayRelative, fmtTons, pickupRisk } from '../lib/format'
import { sequenceProblem } from '../lib/sequence'
import { loadTone } from '../lib/status'
import type { AssignPreview, Order, PlannedStop, Truck } from '../lib/types'
import { moveItem, useSortable } from '../components/sortable'
import { MetaItem, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Button,
  Callout,
  CapacityBar,
  EmptyState,
  LinkButton,
  Pagination,
  Panel,
  SearchInput,
  Spinner,
  StopTypeBadge,
  TruckStatusBadge,
  selectClass,
  startedOnInteractive,
} from '../components/ui'

const DRAG_MIME = 'application/x-fleetops-orders'

type Staged = Record<number, number[]>

/* ----------------------------- order card -------------------------------- */

function OrderCard({
  order,
  selected,
  onToggle,
  onDragStart,
}: {
  order: Order
  selected: boolean
  onToggle: () => void
  onDragStart: (event: React.DragEvent, order: Order) => void
}) {
  const risk = pickupRisk(order.pickup_date)

  return (
    <div
      draggable
      onDragStart={(event) => onDragStart(event, order)}
      onClick={(event) => {
        // The order-code link inside handles its own navigation.
        if (startedOnInteractive(event.target)) return
        onToggle()
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
      className={clsx(
        'cursor-grab rounded-lg border bg-surface-1 p-3 transition-colors active:cursor-grabbing',
        selected
          ? 'border-brand ring-2 ring-brand/20'
          : 'border-line hover:border-line-strong hover:bg-surface-2/60',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <Link
          to={`/orders/${order.id}`}
          onClick={(event) => event.stopPropagation()}
          className="font-mono text-sm font-semibold text-ink hover:text-brand hover:underline"
        >
          {order.code}
        </Link>
        <span className="shrink-0 text-base font-semibold tabular-nums text-ink">
          {fmtTons(order.quantity_tons)}
        </span>
      </div>

      <p className="mt-1 truncate text-sm text-ink">{order.material}</p>
      <p className="truncate text-xs text-ink-dim">
        {order.billing_party}
        {order.order_number && ` · ${order.order_number}`}
      </p>

      <p className="mt-2 truncate text-xs text-ink-soft">
        {order.pickup_name} <span className="text-ink-dim">→</span> {order.drop_name}
      </p>

      <p
        className={clsx(
          'mt-1 text-xs',
          risk === 'overdue'
            ? 'font-semibold text-st-delayed'
            : risk === 'soon'
              ? 'font-medium text-st-pickup'
              : 'text-ink-dim',
        )}
      >
        Collect {fmtDayRelative(order.pickup_date).toLowerCase()} ·{' '}
        {fmtDay(order.pickup_date)}
      </p>
    </div>
  )
}

/* ----------------------------- truck slot -------------------------------- */

function TruckDropSlot({
  truck,
  stagedOrders,
  onDrop,
  onRemove,
  onStageSelection,
  selectionTons,
  selectionCount,
  onAssign,
  assigning,
}: {
  truck: Truck
  stagedOrders: Order[]
  onDrop: (truckId: number, orderIds: number[]) => void
  onRemove: (truckId: number, orderId: number) => void
  onStageSelection: (truckId: number) => void
  selectionTons: number
  selectionCount: number
  onAssign: (truckId: number, orderIds: number[], stops: PlannedStop[] | null) => void
  assigning: boolean
}) {
  const [hover, setHover] = useState<'none' | 'fits' | 'over'>('none')
  const stagedTons = stagedOrders.reduce((sum, order) => sum + order.quantity_tons, 0)
  const loadAfter = truck.capacity.current_load_tons + stagedTons
  const freeAfter = truck.capacity_tons - loadAfter
  const tone = loadTone((loadAfter / (truck.capacity_tons || 1)) * 100)

  const stagedKey = stagedOrders.map((o) => o.id).join(',')

  // Server-side confirmation of the staged set, including the planned stops.
  const preview = useQuery<AssignPreview>({
    queryKey: ['preview', truck.id, stagedKey],
    queryFn: () => api.previewAssign(truck.id, stagedOrders.map((o) => o.id)),
    enabled: stagedOrders.length > 0,
  })

  // A hand-arranged stop order, or null while the suggested one stands.
  const [customStops, setCustomStops] = useState<PlannedStop[] | null>(null)

  // Staging a different set of orders invalidates any manual arrangement.
  useEffect(() => setCustomStops(null), [stagedKey])

  const plannedStops = customStops ?? preview.data?.planned_stops ?? []

  const moveStopTo = useCallback(
    (from: number, to: number) =>
      setCustomStops((current) =>
        moveItem(current ?? preview.data?.planned_stops ?? [], from, to).map(
          (stop, index) => ({ ...stop, sequence: index }),
        ),
      ),
    [preview.data],
  )

  const sortable = useSortable({ onMove: moveStopTo })

  // The orders on this truck after assignment, for the capacity maths.
  const tonsByOrder = useMemo(() => {
    const map = new Map<number, number>()
    truck.orders.forEach((order) => map.set(order.id, order.quantity_tons))
    stagedOrders.forEach((order) => map.set(order.id, order.quantity_tons))
    return map
  }, [truck.orders, stagedOrders])

  const codeByOrder = useMemo(() => {
    const map = new Map<number, string>()
    truck.orders.forEach((order) => map.set(order.id, order.code))
    stagedOrders.forEach((order) => map.set(order.id, order.code))
    return map
  }, [truck.orders, stagedOrders])

  const stopProblem = customStops
    ? sequenceProblem(plannedStops, tonsByOrder, truck.capacity_tons, codeByOrder)
    : null

  const selectionFits = selectionTons <= truck.capacity.available_tons - stagedTons + 1e-6
  const blocked = preview.data ? !preview.data.allowed : false

  return (
    <div
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_MIME)) return
        event.preventDefault()
        // The payload cannot be read during dragover, so the current
        // selection size drives the fits/over hint.
        setHover(selectionFits ? 'fits' : 'over')
      }}
      onDragLeave={() => setHover('none')}
      onDrop={(event) => {
        event.preventDefault()
        setHover('none')
        const raw = event.dataTransfer.getData(DRAG_MIME)
        if (!raw) return
        try {
          onDrop(truck.id, JSON.parse(raw) as number[])
        } catch {
          /* malformed payload: ignore */
        }
      }}
      className={clsx(
        'rounded-lg border bg-surface-1 p-4 transition-colors',
        hover === 'fits' && 'border-st-available ring-2 ring-st-available/20',
        hover === 'over' && 'border-st-delayed ring-2 ring-st-delayed/20',
        hover === 'none' &&
          (stagedOrders.length ? 'border-brand ring-1 ring-brand/15' : 'border-line'),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/trucks/${truck.id}`}
            className="font-mono text-sm font-semibold text-ink hover:text-brand hover:underline"
          >
            {truck.registration_number}
          </Link>
          <p className="truncate text-xs text-ink-dim">
            {truck.driver ? (
              <Link
                to={`/drivers/${truck.driver.id}`}
                className="hover:text-brand hover:underline"
              >
                {truck.driver.name}
              </Link>
            ) : (
              'No driver'
            )}
            {truck.base_city && ` · ${truck.base_city}`}
          </p>
        </div>
        <TruckStatusBadge status={truck.status} size="sm" />
      </div>

      <div className="mt-3">
        <CapacityBar capacity={truck.capacity} pendingTons={stagedTons} />
      </div>

      {stagedOrders.length === 0 ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-dim">
            {truck.capacity.order_count > 0
              ? `${truck.capacity.order_count} order(s) already on board`
              : 'Empty — drop orders here'}
          </span>
          {selectionCount > 0 && (
            <Button
              size="sm"
              variant={selectionFits ? 'secondary' : 'danger'}
              onClick={() => onStageSelection(truck.id)}
              disabled={!selectionFits}
              title={
                selectionFits
                  ? `Stage ${selectionCount} selected order(s)`
                  : `${fmtTons(selectionTons)} selected exceeds ${fmtTons(truck.capacity.available_tons)} free`
              }
            >
              {selectionFits ? `Add ${selectionCount}` : 'Will not fit'}
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {/* The arithmetic, spelled out, so the operator can trust the drop. */}
          <div>
            <p className="text-sm tabular-nums">
              {truck.capacity.current_load_tons > 0 && (
                <>
                  <span className="text-ink-dim">On board </span>
                  <span className="font-medium">
                    {fmtTons(truck.capacity.current_load_tons)}
                  </span>
                  <span className="text-ink-dim"> + </span>
                </>
              )}
              {stagedOrders.map((order, index) => (
                <span key={order.id}>
                  {index > 0 && <span className="text-ink-dim"> + </span>}
                  <span className="font-medium">{fmtTons(order.quantity_tons)}</span>
                </span>
              ))}
              <span className="text-ink-dim"> = </span>
              <span className={clsx('font-semibold', tone.text)}>{fmtTons(loadAfter)}</span>
              <span className="text-ink-dim"> of {fmtTons(truck.capacity_tons)}</span>
            </p>
            <p
              className={clsx(
                'mt-0.5 text-xs tabular-nums',
                freeAfter < 0 ? 'font-semibold text-st-delayed' : 'text-ink-dim',
              )}
            >
              {freeAfter < 0
                ? `Over capacity by ${fmtTons(-freeAfter)}`
                : `${fmtTons(freeAfter)} would remain free`}
            </p>
          </div>

          <ul className="space-y-1">
            {stagedOrders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs">
                  <Link
                    to={`/orders/${order.id}`}
                    className="font-mono font-medium text-ink hover:text-brand hover:underline"
                  >
                    {order.code}
                  </Link>
                  <span className="text-ink-dim">
                    {' '}
                    {order.pickup_name}→{order.drop_name}
                  </span>
                </span>
                <button
                  onClick={() => onRemove(truck.id, order.id)}
                  className="grid size-5 shrink-0 place-items-center rounded text-ink-dim hover:bg-surface-2 hover:text-st-delayed"
                  aria-label={`Remove ${order.code}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {blocked && <Callout tone="danger">{preview.data?.reason}</Callout>}

          {preview.data?.allowed && preview.data.reason && (
            <Callout tone="warning">{preview.data.reason}</Callout>
          )}

          {preview.data?.allowed && plannedStops.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="label">Stops ({plannedStops.length})</p>
                {customStops ? (
                  <button
                    onClick={() => setCustomStops(null)}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    Reset to suggested
                  </button>
                ) : (
                  <span className="text-xs text-ink-dim">Drag to reorder</span>
                )}
              </div>

              <ol className="space-y-0.5">
                {plannedStops.map((stop, index) => {
                  const indicator = sortable.indicator(index)
                  return (
                    <li
                      key={`${stop.place_name}-${stop.stop_type}-${index}`}
                      {...sortable.itemProps(index)}
                      className={clsx(
                        'relative flex cursor-grab items-center gap-2 rounded px-1 py-1 text-xs',
                        'hover:bg-surface-2 active:cursor-grabbing',
                        sortable.dragIndex === index && 'opacity-40',
                      )}
                    >
                      {indicator && (
                        <span
                          aria-hidden
                          className={clsx(
                            'pointer-events-none absolute inset-x-0 h-0.5 bg-brand',
                            indicator === 'above' ? 'top-0' : 'bottom-0',
                          )}
                        />
                      )}
                      <span className="w-3.5 shrink-0 text-right tabular-nums text-ink-dim">
                        {index + 1}
                      </span>
                      <StopTypeBadge type={stop.stop_type} />
                      <span className="min-w-0 flex-1 truncate text-ink-soft">
                        {stop.place_name}
                      </span>
                      <span className="flex shrink-0 gap-0.5">
                        <button
                          onClick={() => moveStopTo(index, index - 1)}
                          disabled={index === 0}
                          aria-label={`Move ${stop.place_name} earlier`}
                          className="grid size-5 place-items-center rounded text-ink-dim hover:bg-surface-3 hover:text-ink disabled:opacity-25"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveStopTo(index, index + 1)}
                          disabled={index === plannedStops.length - 1}
                          aria-label={`Move ${stop.place_name} later`}
                          className="grid size-5 place-items-center rounded text-ink-dim hover:bg-surface-3 hover:text-ink disabled:opacity-25"
                        >
                          ↓
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ol>

              {stopProblem && (
                <div className="mt-2">
                  <Callout tone="danger">{stopProblem}</Callout>
                </div>
              )}
            </div>
          )}

          <Button
            variant="primary"
            className="w-full"
            disabled={assigning || freeAfter < 0 || blocked || stopProblem !== null}
            onClick={() =>
              onAssign(
                truck.id,
                stagedOrders.map((o) => o.id),
                customStops,
              )
            }
          >
            {assigning
              ? 'Assigning…'
              : `Assign ${stagedOrders.length} order${stagedOrders.length > 1 ? 's' : ''}`}
          </Button>
        </div>
      )}
    </div>
  )
}

/* -------------------------------- page ----------------------------------- */

/** What the server will sort the backlog by. */
type OrderSort = 'pickup_date' | 'quantity_tons' | 'pickup_name'

// The board is two scrolling columns; these are what fits without the panes
// turning into an endless scroll.
const ORDERS_PER_PAGE = 25
const TRUCKS_PER_PAGE = 24


export default function Assign() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [selected, setSelected] = useState<number[]>([])
  const [staged, setStaged] = useState<Staged>({})
  const [truckSearch, setTruckSearch] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [sort, setSort] = useState<OrderSort>('pickup_date')
  const [orderPage, setOrderPage] = useState(1)
  const [truckPage, setTruckPage] = useState(1)

  // Both halves of the board are paged, searched and sorted by the server.
  // The backlog and the fleet are each their own list, so each keeps its own
  // page number.
  const board = useQuery({
    queryKey: [
      'board',
      orderPage,
      orderSearch.trim(),
      sort,
      truckPage,
      truckSearch.trim(),
    ],
    queryFn: () =>
      api.board({
        page: orderPage,
        page_size: ORDERS_PER_PAGE,
        order_search: orderSearch.trim() || undefined,
        order_sort: sort,
        truck_page: truckPage,
        truck_page_size: TRUCKS_PER_PAGE,
        truck_search: truckSearch.trim() || undefined,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 45_000,
  })

  // A new search or sort invalidates the position in its own list.
  useEffect(() => setOrderPage(1), [orderSearch, sort])
  useEffect(() => setTruckPage(1), [truckSearch])

  const orderPageData = board.data?.unassigned_orders
  const truckPageData = board.data?.trucks

  const stagedIds = useMemo(() => new Set(Object.values(staged).flat()), [staged])

  // Orders stay known after their page scrolls away: a selection made on page
  // one must still have its tonnage when the user stages it from page three.
  const seenOrders = useRef(new Map<number, Order>())
  for (const order of orderPageData?.items ?? []) {
    seenOrders.current.set(order.id, order)
  }
  const orderById = seenOrders.current

  // Staged orders are hidden -- they are already sitting on a truck card.
  // Sorting and searching were done in SQL, so the page is shown as given.
  const availableOrders = (orderPageData?.items ?? []).filter(
    (order) => !stagedIds.has(order.id),
  )

  const trucks = truckPageData?.items ?? []

  const selectionTons = useMemo(
    () => selected.reduce((sum, id) => sum + (orderById.get(id)?.quantity_tons ?? 0), 0),
    [selected, orderById],
  )

  const assignMutation = useMutation({
    mutationFn: async ({
      truckId,
      orderIds,
      stops,
    }: {
      truckId: number
      orderIds: number[]
      /** A hand-arranged stop order, or null to keep the suggested one. */
      stops: PlannedStop[] | null
    }) => {
      const result = await api.assign(truckId, orderIds, true)

      // A custom arrangement is applied through the trip's own reorder
      // endpoint, which is the single place that validates a manual route.
      if (stops && stops.length > 0 && result.trip) {
        try {
          const trip = await api.reorderTrip(
            result.trip.id,
            stops.map((stop) => ({
              stop_type: stop.stop_type,
              order_ids: stop.order_ids,
            })),
          )
          return { result: { ...result, trip }, reorderError: null as string | null }
        } catch (error) {
          // The trip exists and is correct, just in the suggested order.
          const payload = (error as ApiError).payload as
            | { detail?: { message?: string } }
            | undefined
          return {
            result,
            reorderError: payload?.detail?.message ?? (error as Error).message,
          }
        }
      }
      return { result, reorderError: null as string | null }
    },
    onSuccess: ({ result, reorderError }, variables) => {
      setStaged((current) => {
        const next = { ...current }
        delete next[variables.truckId]
        return next
      })
      setSelected((current) => current.filter((id) => !variables.orderIds.includes(id)))

      if (reorderError) {
        toast.error(
          `Assigned, but the stop order was not applied`,
          `${result.trip?.code ?? 'The trip'} was created in the suggested order. ${reorderError}`,
        )
      } else {
        toast.success(
          `${variables.orderIds.length} order(s) assigned to ${result.truck.registration_number}`,
          result.trip
            ? `${result.trip.code} · ${result.trip.stops.length} stops · now carrying ` +
              `${fmtTons(result.capacity.current_load_tons)} of ${fmtTons(result.capacity.capacity_tons)}`
            : undefined,
        )
      }

      void queryClient.invalidateQueries({ queryKey: ['board'] })
      void queryClient.invalidateQueries({ queryKey: ['trucks'] })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['trips'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error) => {
      const payload = (error as ApiError).payload as
        | { detail?: { message?: string } }
        | undefined
      toast.error('Assignment rejected', payload?.detail?.message ?? (error as Error).message)
    },
  })

  const stageOrders = useCallback((truckId: number, orderIds: number[]) => {
    setStaged((current) => {
      const next: Staged = {}
      // An order can only be staged on one truck, so strip it elsewhere.
      Object.entries(current).forEach(([key, ids]) => {
        const kept = ids.filter((id) => !orderIds.includes(id))
        if (kept.length) next[Number(key)] = kept
      })
      next[truckId] = [...(next[truckId] ?? []), ...orderIds]
      return next
    })
    setSelected((current) => current.filter((id) => !orderIds.includes(id)))
  }, [])

  const unstageOrder = useCallback((truckId: number, orderId: number) => {
    setStaged((current) => {
      const kept = (current[truckId] ?? []).filter((id) => id !== orderId)
      const next = { ...current }
      if (kept.length) next[truckId] = kept
      else delete next[truckId]
      return next
    })
  }, [])

  const onDragStart = (event: React.DragEvent, order: Order) => {
    // Dragging a card inside the selection drags the whole selection.
    const payload = selected.includes(order.id) ? selected : [order.id]
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
  }

  const toggleSelect = (order: Order) => {
    setSelected((current) =>
      current.includes(order.id)
        ? current.filter((id) => id !== order.id)
        : [...current, order.id],
    )
  }

  const totals = board.data?.totals

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      <PageHeader
        title="Assign orders"
        subtitle="Select orders, drop them on a truck, confirm the load."
        meta={
          totals && (
            <>
              <MetaItem label="Waiting">
                {totals.unassigned_count} orders · {fmtTons(totals.unassigned_tons)}
              </MetaItem>
              <MetaItem label="Free capacity">
                {fmtTons(totals.available_capacity_tons)} across{' '}
                {truckPageData?.total ?? 0} trucks
              </MetaItem>
            </>
          )
        }
        actions={<LinkButton to="/orders">All orders</LinkButton>}
      />

      {selected.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-brand bg-brand-tint px-4 py-2.5">
          <p className="text-sm font-medium text-ink">
            {selected.length} order{selected.length > 1 ? 's' : ''} selected ·{' '}
            <span className="tabular-nums">{fmtTons(selectionTons)}</span>
            <span className="ml-2 font-normal text-ink-soft">
              Drag onto a truck, or use “Add” on a truck card.
            </span>
          </p>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear selection
          </Button>
        </div>
      )}

      {board.isLoading && !board.isPlaceholderData ? (
        <Spinner label="Loading the assignment board" />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[23rem_1fr]">
          {/* Unassigned orders */}
          <Panel
            title="Unassigned orders"
            description={`${(orderPageData?.total ?? 0).toLocaleString()} waiting`}
            className="min-h-0"
            actions={
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className={clsx(selectClass, 'h-8 w-auto text-xs')}
                aria-label="Sort orders"
              >
                <option value="pickup_date">Pickup date</option>
                <option value="quantity_tons">Weight</option>
                <option value="pickup_name">Pickup place</option>
              </select>
            }
          >
            <div className="border-b border-line p-3">
              <SearchInput
                value={orderSearch}
                onChange={setOrderSearch}
                placeholder="Filter orders"
              />
            </div>
            {availableOrders.length === 0 ? (
              <EmptyState
                title={orderSearch ? 'No order matches' : 'Nothing waiting'}
                hint={
                  orderSearch
                    ? 'Clear the filter to see the whole backlog.'
                    : 'Every open order has been staged or assigned.'
                }
              />
            ) : (
              <div className="space-y-2 p-3">
                {availableOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    selected={selected.includes(order.id)}
                    onToggle={() => toggleSelect(order)}
                    onDragStart={onDragStart}
                  />
                ))}
              </div>
            )}
            {orderPageData && (
              <Pagination
                page={orderPageData}
                onPage={setOrderPage}
                pageSize={ORDERS_PER_PAGE}
                noun="orders"
                busy={board.isPlaceholderData}
              />
            )}
          </Panel>

          {/* Trucks */}
          <Panel
            title="Trucks with free capacity"
            description={`${(truckPageData?.total ?? 0).toLocaleString()} available`}
            className="min-h-0"
            actions={
              <SearchInput
                value={truckSearch}
                onChange={setTruckSearch}
                placeholder="Find truck or driver"
                className="w-52"
              />
            }
          >
            {trucks.length === 0 ? (
              <EmptyState
                title={truckSearch ? 'No truck matches' : 'No truck has free space'}
                hint={
                  truckSearch
                    ? 'Clear the search to see every truck with room.'
                    : 'Complete a trip to release capacity.'
                }
              />
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
                {trucks.map((truck) => (
                  <TruckDropSlot
                    key={truck.id}
                    truck={truck}
                    stagedOrders={
                      (staged[truck.id] ?? [])
                        .map((id) => orderById.get(id))
                        .filter(Boolean) as Order[]
                    }
                    onDrop={stageOrders}
                    onRemove={unstageOrder}
                    onStageSelection={(truckId) => stageOrders(truckId, selected)}
                    selectionTons={selectionTons}
                    selectionCount={selected.length}
                    onAssign={(truckId, orderIds, stops) =>
                      assignMutation.mutate({ truckId, orderIds, stops })
                    }
                    assigning={
                      assignMutation.isPending && assignMutation.variables?.truckId === truck.id
                    }
                  />
                ))}
              </div>
            )}
            {truckPageData && (
              <Pagination
                page={truckPageData}
                onPage={setTruckPage}
                pageSize={TRUCKS_PER_PAGE}
                noun="trucks"
                busy={board.isPlaceholderData}
              />
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
