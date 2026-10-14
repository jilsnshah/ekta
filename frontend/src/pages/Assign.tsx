import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { fmtDay, fmtTons } from '../lib/format'
import { sequenceProblem } from '../lib/sequence'
import { loadTone } from '../lib/status'
import type { AssignPreview, Order, PlannedStop, Truck } from '../lib/types'
import { moveItem, useSortable } from '../components/sortable'
import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconAssign,
  IconCheck,
  IconClose,
  IconGrip,
  IconOrders,
  IconTruck,
} from '../components/icons'
import { PickupWhen, Route } from '../components/orderBits'
import { MetaItem, PageBody, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Button,
  Callout,
  CapacityBar,
  Code,
  EmptyState,
  IconButton,
  Modal,
  Pagination,
  Panel,
  SearchInput,
  Segmented,
  Spinner,
  StickyActionBar,
  StopTypeBadge,
  TruckStatusBadge,
  startedOnInteractive,
} from '../components/ui'

const DRAG_MIME = 'application/x-ekta-orders'

/** Orders staged on each truck, waiting for the operator to confirm. */
type Staged = Record<number, number[]>

/** What the server will sort the backlog by. */
type OrderSort = 'pickup_date' | 'quantity_tons' | 'pickup_name'

// The board's two lists are paged separately; these fit each pane.
const ORDERS_PER_PAGE = 25
const TRUCKS_PER_PAGE = 24

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/* ----------------------------- order card -------------------------------- */

/**
 * One order in the backlog. Tapping anywhere toggles it -- the check circle
 * says so -- and on a desk it can also be dragged onto a truck.
 */
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
  return (
    <div
      draggable
      onDragStart={(event) => onDragStart(event, order)}
      onClick={(event) => {
        // The order-code link inside handles its own navigation.
        if (startedOnInteractive(event.target)) return
        onToggle()
      }}
      role="checkbox"
      tabIndex={0}
      aria-checked={selected}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
      className={clsx(
        'group flex cursor-pointer gap-3 rounded-xl border bg-surface-1 p-3.5 transition-[border-color,box-shadow,background-color] select-none lg:cursor-grab lg:active:cursor-grabbing',
        selected
          ? 'border-brand/60 bg-brand-tint/60 shadow-raised ring-2 ring-brand/15'
          : 'border-line hover:border-line-strong hover:shadow-raised',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
          selected
            ? 'border-brand bg-brand text-on-brand'
            : 'border-line-strong bg-surface-1 group-hover:border-ink-dim',
        )}
      >
        {selected && <IconCheck size={13} strokeWidth={2.6} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            to={`/orders/${order.id}`}
            onClick={(event) => event.stopPropagation()}
            className="font-mono text-[0.8125rem] font-semibold whitespace-nowrap text-ink hover:text-brand hover:underline"
          >
            {order.code}
          </Link>
          <span className="shrink-0 text-base font-semibold tabular-nums text-ink">
            {fmtTons(order.quantity_tons)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-ink-soft">
          {order.material}
          <span className="text-ink-dim"> · {order.billing_party}</span>
        </p>
        <div className="mt-2.5">
          <Route from={order.pickup_name} to={order.drop_name} />
        </div>
        <p className="mt-2 text-xs text-ink-dim">
          Collect <PickupWhen date={order.pickup_date} className="text-xs" />
          <span> · {fmtDay(order.pickup_date)}</span>
        </p>
      </div>
    </div>
  )
}

/* ----------------------------- truck card -------------------------------- */

/**
 * One truck with room. When orders are selected it says at once whether
 * they fit, so the operator never has to do the subtraction -- and the whole
 * card is the button that loads them.
 */
function TruckCard({
  truck,
  stagedOrders,
  selectionTons,
  selectionCount,
  onLoad,
  onReview,
  onDropOrders,
}: {
  truck: Truck
  stagedOrders: Order[]
  selectionTons: number
  selectionCount: number
  onLoad: () => void
  onReview: () => void
  onDropOrders: (orderIds: number[]) => void
}) {
  const [hover, setHover] = useState<'none' | 'fits' | 'over'>('none')
  const stagedTons = stagedOrders.reduce((sum, order) => sum + order.quantity_tons, 0)
  const room = truck.capacity.available_tons - stagedTons
  const fits = selectionTons <= room + 1e-6
  const selecting = selectionCount > 0
  const spare = room - selectionTons

  return (
    <div
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_MIME)) return
        event.preventDefault()
        // The payload cannot be read during dragover, so the current
        // selection size drives the fits/over hint.
        setHover(fits ? 'fits' : 'over')
      }}
      onDragLeave={() => setHover('none')}
      onDrop={(event) => {
        event.preventDefault()
        setHover('none')
        const raw = event.dataTransfer.getData(DRAG_MIME)
        if (!raw) return
        try {
          onDropOrders(JSON.parse(raw) as number[])
        } catch {
          /* malformed payload: ignore */
        }
      }}
      className={clsx(
        'relative flex flex-col rounded-xl border bg-surface-1 p-4 transition-[border-color,box-shadow,opacity]',
        hover === 'fits' && 'border-st-available ring-4 ring-st-available/15',
        hover === 'over' && 'border-st-delayed ring-4 ring-st-delayed/15',
        hover === 'none' &&
          (stagedOrders.length
            ? 'border-brand/50 ring-2 ring-brand/15'
            : selecting && fits
              ? 'border-line hover:border-st-available/60 hover:shadow-raised'
              : 'border-line'),
        selecting && !fits && hover === 'none' && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Code to={`/trucks/${truck.id}`} className="text-sm font-semibold">
            {truck.registration_number}
          </Code>
          <p className="mt-0.5 truncate text-xs text-ink-dim">
            {truck.driver ? truck.driver.name : 'No driver'}
            {truck.base_city && ` · ${truck.base_city}`}
          </p>
        </div>
        <TruckStatusBadge status={truck.status} size="sm" />
      </div>

      <div className="mt-3.5">
        <CapacityBar
          capacity={truck.capacity}
          size="sm"
          pendingTons={stagedTons + (selecting && fits ? selectionTons : 0)}
        />
      </div>

      <div className="mt-3.5 flex min-h-10 items-center justify-between gap-2">
        {stagedOrders.length > 0 ? (
          <>
            <span className="text-xs font-medium text-brand">
              {plural(stagedOrders.length, 'order')} staged
            </span>
            <Button size="sm" variant="primary" onClick={onReview}>
              Review load
              <IconArrowRight size={14} />
            </Button>
          </>
        ) : selecting ? (
          <>
            <span
              className={clsx(
                'text-xs font-semibold tabular-nums',
                fits ? 'text-st-available' : 'text-st-delayed',
              )}
            >
              {fits ? `Fits · ${fmtTons(spare)} spare` : `${fmtTons(-spare)} too heavy`}
            </span>
            <Button size="sm" variant={fits ? 'secondary' : 'ghost'} disabled={!fits} onClick={onLoad}>
              Load here
            </Button>
          </>
        ) : (
          <span className="text-xs text-ink-dim">
            {truck.capacity.order_count > 0
              ? `${plural(truck.capacity.order_count, 'order')} already on board`
              : 'Empty and ready'}
          </span>
        )}
      </div>

      {/* Over-capacity is a statement, not a disabled button with a riddle. */}
      {selecting && !fits && stagedOrders.length === 0 && (
        <span className="sr-only">
          The selected orders weigh {fmtTons(selectionTons)}; this truck has {fmtTons(room)} free.
        </span>
      )}
    </div>
  )
}

/* ------------------------------ load plan -------------------------------- */

/**
 * The confirmation for one truck: the arithmetic spelled out, the orders
 * going on, the planned stops (re-orderable), and whether it can commit.
 * Returns the body and the commit action separately, so the sheet can put
 * the button in its footer where the thumb is.
 */
function useLoadPlan({
  truck,
  stagedOrders,
  customStops,
  onCustomStops,
  onRemove,
  onAssign,
  assigning,
}: {
  truck: Truck
  stagedOrders: Order[]
  customStops: PlannedStop[] | null
  onCustomStops: (stops: PlannedStop[] | null) => void
  onRemove: (orderId: number) => void
  onAssign: (orderIds: number[], stops: PlannedStop[] | null) => void
  assigning: boolean
}) {
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

  const plannedStops = customStops ?? preview.data?.planned_stops ?? []

  const moveStopTo = useCallback(
    (from: number, to: number) =>
      onCustomStops(
        moveItem(customStops ?? preview.data?.planned_stops ?? [], from, to).map(
          (stop, index) => ({ ...stop, sequence: index }),
        ),
      ),
    [customStops, preview.data, onCustomStops],
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

  const blocked = preview.data ? !preview.data.allowed : false
  const canAssign =
    !assigning && freeAfter >= 0 && !blocked && stopProblem === null && stagedOrders.length > 0

  return {
    canAssign,
    assign: () => onAssign(stagedOrders.map((o) => o.id), customStops),
    body: (
      <div className="space-y-6">
        {/* The arithmetic, spelled out, so the operator can trust the load. */}
        <section className="rounded-xl bg-surface-2/70 p-4 ring-1 ring-line ring-inset">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-ink-soft">After loading</span>
            <span className={clsx('text-2xl font-semibold tabular-nums', tone.text)}>
              {fmtTons(loadAfter)}
              <span className="text-base font-normal text-ink-dim">
                {' '}
                / {fmtTons(truck.capacity_tons)}
              </span>
            </span>
          </div>
          <div className="mt-3">
            <CapacityBar capacity={truck.capacity} pendingTons={stagedTons} barOnly />
          </div>
          <p className="mt-3 text-sm text-ink-soft tabular-nums">
            {truck.capacity.current_load_tons > 0 && (
              <>
                {fmtTons(truck.capacity.current_load_tons)} on board
                <span className="text-ink-dim"> + </span>
              </>
            )}
            {stagedOrders.map((order, index) => (
              <span key={order.id}>
                {index > 0 && <span className="text-ink-dim"> + </span>}
                {fmtTons(order.quantity_tons)}
              </span>
            ))}
            <span className="text-ink-dim"> = </span>
            <span className="font-semibold text-ink">{fmtTons(loadAfter)}</span>
          </p>
          <p
            className={clsx(
              'mt-1 text-sm font-medium tabular-nums',
              freeAfter < 0 ? 'text-st-delayed' : 'text-st-available',
            )}
          >
            {freeAfter < 0
              ? `Over capacity by ${fmtTons(-freeAfter)}`
              : `${fmtTons(freeAfter)} will still be free`}
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">
            Loading {plural(stagedOrders.length, 'order')}
          </h3>
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
            {stagedOrders.map((order) => (
              <li key={order.id} className="flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <Code to={`/orders/${order.id}`} className="font-semibold">
                      {order.code}
                    </Code>
                    <span className="truncate text-sm text-ink-soft">{order.material}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-dim">
                    {order.pickup_name} → {order.drop_name}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {fmtTons(order.quantity_tons)}
                </span>
                <IconButton
                  label={`Remove ${order.code}`}
                  onClick={() => onRemove(order.id)}
                  className="-mr-1.5 sm:size-8"
                >
                  <IconClose size={16} />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>

        {blocked && <Callout tone="danger">{preview.data?.reason}</Callout>}
        {preview.data?.allowed && preview.data.reason && (
          <Callout tone="warning">{preview.data.reason}</Callout>
        )}

        {preview.isLoading ? (
          <Spinner rows={3} label="Planning stops" />
        ) : (
          preview.data?.allowed &&
          plannedStops.length > 0 && (
            <section>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">
                  Route · {plural(plannedStops.length, 'stop')}
                </h3>
                {customStops ? (
                  <button
                    onClick={() => onCustomStops(null)}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Use suggested order
                  </button>
                ) : (
                  <span className="text-xs text-ink-dim">Suggested · reorder if needed</span>
                )}
              </div>

              <ol className="divide-y divide-line rounded-xl ring-1 ring-line">
                {plannedStops.map((stop, index) => {
                  const indicator = sortable.indicator(index)
                  return (
                    <li
                      key={`${stop.place_name}-${stop.stop_type}-${index}`}
                      {...sortable.itemProps(index)}
                      className={clsx(
                        'relative flex items-center gap-3 px-3 py-2.5 lg:cursor-grab lg:active:cursor-grabbing',
                        sortable.dragIndex === index && 'opacity-40',
                      )}
                    >
                      {indicator && (
                        <span
                          aria-hidden
                          className={clsx(
                            'pointer-events-none absolute inset-x-0 h-0.5 bg-brand',
                            indicator === 'above' ? '-top-px' : '-bottom-px',
                          )}
                        />
                      )}
                      <span className="hidden text-ink-dim lg:block" aria-hidden>
                        <IconGrip size={14} />
                      </span>
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ink-soft tabular-nums">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <StopTypeBadge type={stop.stop_type} />
                        <p className="mt-1 truncate text-sm font-medium text-ink">
                          {stop.place_name}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <IconButton
                          label={`Move ${stop.place_name} earlier`}
                          variant="secondary"
                          onClick={() => moveStopTo(index, index - 1)}
                          disabled={index === 0}
                          className="sm:size-8"
                        >
                          <IconArrowUp size={15} />
                        </IconButton>
                        <IconButton
                          label={`Move ${stop.place_name} later`}
                          variant="secondary"
                          onClick={() => moveStopTo(index, index + 1)}
                          disabled={index === plannedStops.length - 1}
                          className="sm:size-8"
                        >
                          <IconArrowDown size={15} />
                        </IconButton>
                      </div>
                    </li>
                  )
                })}
              </ol>

              {stopProblem && (
                <div className="mt-3">
                  <Callout tone="danger">{stopProblem}</Callout>
                </div>
              )}
            </section>
          )
        )}
      </div>
    ),
  }
}

/* -------------------------------- page ----------------------------------- */

export default function Assign() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [selected, setSelected] = useState<number[]>([])
  const [staged, setStaged] = useState<Staged>({})
  const [customStops, setCustomStops] = useState<Record<number, PlannedStop[] | null>>({})
  const [reviewing, setReviewing] = useState<number | null>(null)
  const [truckSearch, setTruckSearch] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [sort, setSort] = useState<OrderSort>('pickup_date')
  const [orderPage, setOrderPage] = useState(1)
  const [truckPage, setTruckPage] = useState(1)
  // Phones and tablets show one list at a time.
  const [pane, setPane] = useState<'orders' | 'trucks'>('orders')

  // Both halves of the board are paged, searched and sorted by the server.
  // The backlog and the fleet are each their own list, so each keeps its own
  // page number.
  const board = useQuery({
    queryKey: ['board', orderPage, orderSearch.trim(), sort, truckPage, truckSearch.trim()],
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

  // Trucks too, so the load plan survives a truck page change.
  const seenTrucks = useRef(new Map<number, Truck>())
  for (const truck of truckPageData?.items ?? []) {
    seenTrucks.current.set(truck.id, truck)
  }

  // Staged orders are hidden -- they are already sitting on a truck card.
  // Sorting and searching were done in SQL, so the page is shown as given.
  const availableOrders = (orderPageData?.items ?? []).filter(
    (order) => !stagedIds.has(order.id),
  )

  const selectionTonsForSort = selected.reduce(
    (sum, id) => sum + (seenOrders.current.get(id)?.quantity_tons ?? 0),
    0,
  )
  // While orders are selected, the trucks on this page that can take them
  // come first: on a phone the first card should be one you can tap. The
  // page itself is unchanged, so paging stays exact.
  const trucks = useMemo(() => {
    const items = truckPageData?.items ?? []
    if (selected.length === 0) return items
    const rank = (truck: Truck) => {
      if (staged[truck.id]?.length) return 0
      const stagedTons = (staged[truck.id] ?? []).reduce(
        (sum, id) => sum + (seenOrders.current.get(id)?.quantity_tons ?? 0),
        0,
      )
      return selectionTonsForSort <= truck.capacity.available_tons - stagedTons + 1e-6 ? 1 : 2
    }
    return [...items].sort((a, b) => rank(a) - rank(b))
  }, [truckPageData, selected.length, staged, selectionTonsForSort])

  const selectionTons = useMemo(
    () => selected.reduce((sum, id) => sum + (orderById.get(id)?.quantity_tons ?? 0), 0),
    [selected, orderById],
  )

  const fittingOnPage = trucks.filter((truck) => {
    const stagedTons = (staged[truck.id] ?? []).reduce(
      (sum, id) => sum + (orderById.get(id)?.quantity_tons ?? 0),
      0,
    )
    return selectionTons <= truck.capacity.available_tons - stagedTons + 1e-6
  }).length

  const stagedFor = (truckId: number) =>
    (staged[truckId] ?? []).map((id) => orderById.get(id)).filter(Boolean) as Order[]

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
      setCustomStops((current) => ({ ...current, [variables.truckId]: null }))
      setSelected((current) => current.filter((id) => !variables.orderIds.includes(id)))
      setReviewing(null)
      setPane('orders')

      if (reorderError) {
        toast.error(
          `Assigned, but the stop order was not applied`,
          `${result.trip?.code ?? 'The trip'} was created in the suggested order. ${reorderError}`,
        )
      } else {
        toast.success(
          `${plural(variables.orderIds.length, 'order')} assigned to ${result.truck.registration_number}`,
          result.trip
            ? `${result.trip.code} · ${plural(result.trip.stops.length, 'stop')} · now carrying ` +
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

  /** Put orders on a truck (pending confirmation) and open its load plan. */
  const stageOrders = useCallback((truckId: number, orderIds: number[]) => {
    if (orderIds.length === 0) return
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
    // A different set of orders invalidates any hand-arranged route.
    setCustomStops((current) => ({ ...current, [truckId]: null }))
    setSelected((current) => current.filter((id) => !orderIds.includes(id)))
    setReviewing(truckId)
  }, [])

  const unstageOrder = useCallback((truckId: number, orderId: number) => {
    setStaged((current) => {
      const kept = (current[truckId] ?? []).filter((id) => id !== orderId)
      const next = { ...current }
      if (kept.length) next[truckId] = kept
      else delete next[truckId]
      return next
    })
    setCustomStops((current) => ({ ...current, [truckId]: null }))
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
  const stagedTruckCount = Object.keys(staged).length

  // The truck under review, and its plan.
  const reviewTruck = reviewing !== null ? seenTrucks.current.get(reviewing) : undefined
  const reviewOrders = reviewing !== null ? stagedFor(reviewing) : []

  /* ------------------------------ panes ------------------------------ */

  const ordersPane = (
    <Panel
      title="Waiting for a truck"
      description={`${(orderPageData?.total ?? 0).toLocaleString('en-IN')} unassigned · ${fmtTons(totals?.unassigned_tons)}`}
      icon={<IconOrders size={18} />}
      className="lg:max-h-[calc(100dvh-12.5rem)]"
      bodyClassName="min-h-0 overflow-visible lg:overflow-y-auto"
    >
      <div className="sticky top-0 z-10 space-y-2.5 border-b border-line bg-surface-1/95 p-3 backdrop-blur-sm sm:px-4">
        <SearchInput value={orderSearch} onChange={setOrderSearch} placeholder="Find an order" />
        <Segmented
          size="sm"
          value={sort}
          onChange={setSort}
          className="w-full"
          options={[
            { value: 'pickup_date', label: 'Soonest' },
            { value: 'quantity_tons', label: 'Heaviest' },
            { value: 'pickup_name', label: 'By place' },
          ]}
        />
      </div>
      {availableOrders.length === 0 ? (
        <EmptyState
          icon={<IconCheck size={20} />}
          title={orderSearch ? 'No order matches' : 'Nothing waiting'}
          hint={
            orderSearch
              ? 'Clear the search to see the whole backlog.'
              : 'Every open order has been staged or assigned.'
          }
        />
      ) : (
        <div className="space-y-2 p-3 sm:px-4">
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
  )

  const trucksPane = (
    <Panel
      title="Trucks with room"
      description={`${(truckPageData?.total ?? 0).toLocaleString('en-IN')} trucks · ${fmtTons(totals?.available_capacity_tons)} free`}
      icon={<IconTruck size={18} />}
      className="lg:max-h-[calc(100dvh-12.5rem)]"
      bodyClassName="min-h-0 overflow-visible lg:overflow-y-auto"
      actions={
        <SearchInput
          value={truckSearch}
          onChange={setTruckSearch}
          placeholder="Truck or driver"
          className="hidden w-56 sm:block"
        />
      }
    >
      <div className="border-b border-line p-3 sm:hidden">
        <SearchInput value={truckSearch} onChange={setTruckSearch} placeholder="Truck or driver" />
      </div>
      {trucks.length === 0 ? (
        <EmptyState
          icon={<IconTruck size={20} />}
          title={truckSearch ? 'No truck matches' : 'No truck has free space'}
          hint={
            truckSearch
              ? 'Clear the search to see every truck with room.'
              : 'Complete a trip to release capacity.'
          }
        />
      ) : (
        <>
        {/* Say it plainly when nothing here can take the selection. */}
        {selected.length > 0 && fittingOnPage === 0 && (
          <div className="px-3 pt-3 sm:px-4 sm:pt-4">
            <Callout tone="warning">
              No truck on this page has {fmtTons(selectionTons)} free.{' '}
              {truckPageData && truckPageData.has_next
                ? 'Try the next page, or select fewer orders.'
                : 'Select fewer orders, or split them across trucks.'}
            </Callout>
          </div>
        )}
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 2xl:grid-cols-3">
          {trucks.map((truck) => (
            <TruckCard
              key={truck.id}
              truck={truck}
              stagedOrders={stagedFor(truck.id)}
              selectionTons={selectionTons}
              selectionCount={selected.length}
              onLoad={() => stageOrders(truck.id, selected)}
              onReview={() => setReviewing(truck.id)}
              onDropOrders={(ids) => stageOrders(truck.id, ids)}
            />
          ))}
        </div>
        </>
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
  )

  return (
    <PageBody wide className={clsx(selected.length > 0 && 'pb-28 lg:pb-28')}>
      <PageHeader
        title="Assign orders"
        subtitle={
          <>
            <span className="hidden lg:inline">
              Select orders, then click a truck — or drag them onto it.
            </span>
            <span className="lg:hidden">Select orders, then choose a truck for them.</span>
          </>
        }
        meta={
          totals && (
            <>
              <MetaItem label="Waiting">
                {plural(totals.unassigned_count, 'order')} · {fmtTons(totals.unassigned_tons)}
              </MetaItem>
              <MetaItem label="Free capacity">{fmtTons(totals.available_capacity_tons)}</MetaItem>
              {stagedTruckCount > 0 && (
                <MetaItem label="Staged">{plural(stagedTruckCount, 'truck')}</MetaItem>
              )}
            </>
          )
        }
      />

      {board.isLoading && !board.isPlaceholderData ? (
        <Panel>
          <Spinner label="Loading the assignment board" />
        </Panel>
      ) : (
        <>
          {/* Phones and tablets: one list at a time. */}
          <div className="mb-3 lg:hidden">
            <Segmented
              value={pane}
              onChange={setPane}
              className="w-full"
              options={[
                {
                  value: 'orders',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      Orders
                      <span className="text-ink-dim tabular-nums">
                        {orderPageData?.total ?? 0}
                      </span>
                    </span>
                  ),
                },
                {
                  value: 'trucks',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      Trucks
                      {stagedTruckCount > 0 ? (
                        <span className="rounded-full bg-brand px-1.5 text-xs text-on-brand tabular-nums">
                          {stagedTruckCount} staged
                        </span>
                      ) : (
                        <span className="text-ink-dim tabular-nums">
                          {truckPageData?.total ?? 0}
                        </span>
                      )}
                    </span>
                  ),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)] [&>*]:min-w-0">
            <div className={clsx(pane !== 'orders' && 'max-lg:hidden')}>{ordersPane}</div>
            <div className={clsx(pane !== 'trucks' && 'max-lg:hidden')}>
              {selected.length > 0 && (
                <div className="mb-3 flex items-center gap-3 rounded-xl bg-brand-tint px-4 py-3 ring-1 ring-brand/20 lg:hidden">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-on-brand">
                    <IconAssign size={16} />
                  </span>
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold text-ink">
                      Loading {plural(selected.length, 'order')} · {fmtTons(selectionTons)}
                    </span>
                    <span className="block text-ink-soft">Tap “Load here” on a truck that fits.</span>
                  </p>
                  <button
                    onClick={() => setPane('orders')}
                    className="shrink-0 text-sm font-medium text-brand"
                  >
                    Change
                  </button>
                </div>
              )}
              {trucksPane}
            </div>
          </div>
        </>
      )}

      {/* The selection tray: what is selected, and the one next step. */}
      {selected.length > 0 && (
        <StickyActionBar always offset="lg" className="lg:left-64">
          <div className="mx-auto flex max-w-[1720px] items-center gap-3 lg:px-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {plural(selected.length, 'order')} selected
                <span className="font-normal text-ink-soft"> · {fmtTons(selectionTons)}</span>
              </p>
              <p className="hidden truncate text-sm text-ink-dim lg:block">
                Trucks that can take them are marked “Fits”. Click one, or drag the orders onto
                it.
              </p>
            </div>
            <Button variant="ghost" onClick={() => setSelected([])} className="shrink-0">
              Clear
            </Button>
            {pane === 'orders' && (
              <Button
                variant="primary"
                className="shrink-0 lg:hidden"
                onClick={() => {
                  setPane('trucks')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              >
                Choose truck
                <IconArrowRight size={16} />
              </Button>
            )}
          </div>
        </StickyActionBar>
      )}

      {reviewTruck && (
        <LoadPlanSheet
          key={reviewTruck.id}
          truck={reviewTruck}
          stagedOrders={reviewOrders}
          customStops={customStops[reviewTruck.id] ?? null}
          onCustomStops={(stops) =>
            setCustomStops((current) => ({ ...current, [reviewTruck.id]: stops }))
          }
          onRemove={(orderId) => unstageOrder(reviewTruck.id, orderId)}
          onClose={() => setReviewing(null)}
          onUnstageAll={() => {
            setStaged((current) => {
              const next = { ...current }
              delete next[reviewTruck.id]
              return next
            })
            setReviewing(null)
          }}
          onAssign={(orderIds, stops) =>
            assignMutation.mutate({ truckId: reviewTruck.id, orderIds, stops })
          }
          assigning={assignMutation.isPending}
        />
      )}
    </PageBody>
  )
}

/** The load plan in its sheet: a side drawer on a desk, a bottom sheet on a phone. */
function LoadPlanSheet({
  truck,
  stagedOrders,
  customStops,
  onCustomStops,
  onRemove,
  onClose,
  onUnstageAll,
  onAssign,
  assigning,
}: {
  truck: Truck
  stagedOrders: Order[]
  customStops: PlannedStop[] | null
  onCustomStops: (stops: PlannedStop[] | null) => void
  onRemove: (orderId: number) => void
  onClose: () => void
  onUnstageAll: () => void
  onAssign: (orderIds: number[], stops: PlannedStop[] | null) => void
  assigning: boolean
}) {
  const plan = useLoadPlan({
    truck,
    stagedOrders,
    customStops,
    onCustomStops,
    onRemove,
    onAssign,
    assigning,
  })

  // Removing the last order leaves nothing to review.
  useEffect(() => {
    if (stagedOrders.length === 0) onClose()
  }, [stagedOrders.length, onClose])

  return (
    <Modal
      open
      placement="side"
      onClose={onClose}
      title={
        <span className="flex items-center gap-2.5">
          <span className="font-mono">{truck.registration_number}</span>
          <TruckStatusBadge status={truck.status} size="sm" />
        </span>
      }
      description={
        truck.driver
          ? `${truck.driver.name}${truck.base_city ? ` · ${truck.base_city}` : ''} · ${fmtTons(truck.capacity_tons)} truck`
          : `No driver · ${fmtTons(truck.capacity_tons)} truck`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onUnstageAll}>
            Unstage
          </Button>
          <Button
            variant="primary"
            disabled={!plan.canAssign}
            onClick={plan.assign}
            className="sm:min-w-44"
          >
            {assigning ? 'Assigning…' : `Assign ${plural(stagedOrders.length, 'order')}`}
          </Button>
        </>
      }
    >
      {plan.body}
    </Modal>
  )
}
