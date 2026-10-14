import clsx from 'clsx'
import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { fmtDateTime, fmtDay, fmtDayRelative, fmtTons } from '../lib/format'
import { sequenceProblem } from '../lib/sequence'
import type { Trip, TripStop } from '../lib/types'
import { moveItem, useSortable, type SortableItemProps } from '../components/sortable'
import { MetaItem, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Button,
  Callout,
  CapacityBar,
  EmptyState,
  OrderStatusBadge,
  Panel,
  ProgressBar,
  Spinner,
  Stat,
  StopTypeBadge,
  Table,
  Td,
  Th,
  Tr,
  TripStatusBadge,
} from '../components/ui'

/* ------------------------------ stop list -------------------------------- */

function StopRow({
  stop,
  isNext,
  canReorder,
  onMove,
  onComplete,
  completing,
  disableComplete,
  isLast,
  dragProps,
  dragIndicator,
  isBeingDragged,
  reorderable,
}: {
  stop: TripStop
  isNext: boolean
  canReorder: { up: boolean; down: boolean }
  onMove: (direction: -1 | 1) => void
  onComplete: () => void
  completing: boolean
  disableComplete: boolean
  isLast: boolean
  dragProps: SortableItemProps
  dragIndicator: 'above' | 'below' | null
  isBeingDragged: boolean
  reorderable: boolean
}) {
  const done = stop.status === 'completed'

  return (
    <li
      {...dragProps}
      className={clsx(
        'relative flex gap-4 px-5 py-4 transition-colors',
        isNext && 'bg-brand-tint/60',
        reorderable && !done && 'cursor-grab active:cursor-grabbing',
        isBeingDragged && 'opacity-40',
      )}
    >
      {/* Insertion line showing where the dragged stop would land. */}
      {dragIndicator && (
        <span
          aria-hidden
          className={clsx(
            'pointer-events-none absolute inset-x-0 h-0.5 bg-brand',
            dragIndicator === 'above' ? '-top-px' : '-bottom-px',
          )}
        />
      )}
      {/* Rail */}
      <div className="flex flex-col items-center">
        <span
          className={clsx(
            'grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold tabular-nums',
            done
              ? 'border-st-available bg-st-available text-on-brand'
              : isNext
                ? 'border-brand bg-surface-1 text-brand'
                : 'border-line bg-surface-1 text-ink-dim',
          )}
        >
          {done ? '✓' : stop.sequence + 1}
        </span>
        {!isLast && (
          <span
            className={clsx('mt-1.5 w-0.5 flex-1 rounded', done ? 'bg-st-available/35' : 'bg-line')}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StopTypeBadge type={stop.stop_type} />
          <span className="truncate text-base font-semibold text-ink">
            {stop.place_name}
          </span>
          {isNext && !done && (
            <span className="label text-brand">Next</span>
          )}
        </div>

        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          {stop.place_address}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {stop.place_phone && (
            <a
              href={`tel:${stop.place_phone.replace(/\s/g, '')}`}
              className="font-medium text-brand hover:underline"
            >
              {stop.place_phone}
            </a>
          )}
          {done && (
            <span className="font-medium text-st-available">
              Completed {fmtDateTime(stop.completed_at)}
            </span>
          )}
        </div>

        {stop.orders.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {stop.orders.map((order) => (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs transition-colors hover:border-brand/40 hover:text-brand"
              >
                <span className="font-mono font-medium">{order.code}</span>
                <span className="text-ink-dim"> · {fmtTons(order.quantity_tons)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {!done && (
          <Button
            size="sm"
            variant={isNext && !disableComplete ? 'primary' : 'secondary'}
            onClick={onComplete}
            disabled={completing || disableComplete}
          >
            {completing
              ? 'Saving…'
              : stop.stop_type === 'pickup'
                ? 'Mark picked up'
                : 'Mark delivered'}
          </Button>
        )}
        {!done && (canReorder.up || canReorder.down) && (
          <div className="flex items-center gap-1">
            {/* Visual affordance for the drag; the row itself is the handle. */}
            <span
              aria-hidden
              title="Drag to reorder"
              className="grid size-6 place-items-center text-ink-dim"
            >
              <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
                <circle cx="6" cy="3" r="1.3" />
                <circle cx="10" cy="3" r="1.3" />
                <circle cx="6" cy="8" r="1.3" />
                <circle cx="10" cy="8" r="1.3" />
                <circle cx="6" cy="13" r="1.3" />
                <circle cx="10" cy="13" r="1.3" />
              </svg>
            </span>
            <button
              onClick={() => onMove(-1)}
              disabled={!canReorder.up}
              className="grid size-6 place-items-center rounded border border-line text-ink-dim hover:bg-surface-2 hover:text-ink disabled:opacity-30"
              aria-label={`Move ${stop.place_name} earlier`}
            >
              ↑
            </button>
            <button
              onClick={() => onMove(1)}
              disabled={!canReorder.down}
              className="grid size-6 place-items-center rounded border border-line text-ink-dim hover:bg-surface-2 hover:text-ink disabled:opacity-30"
              aria-label={`Move ${stop.place_name} later`}
            >
              ↓
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

/* ------------------------------- the page -------------------------------- */

export default function TripDetail() {
  const { id } = useParams()
  const tripId = Number(id)
  const queryClient = useQueryClient()
  const toast = useToast()
  const [draft, setDraft] = useState<TripStop[] | null>(null)

  const trip = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => api.trip(tripId),
    enabled: Number.isFinite(tripId),
    refetchInterval: 45_000,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['trip', tripId] })
    void queryClient.invalidateQueries({ queryKey: ['trips'] })
    void queryClient.invalidateQueries({ queryKey: ['trucks'] })
    void queryClient.invalidateQueries({ queryKey: ['orders'] })
    void queryClient.invalidateQueries({ queryKey: ['board'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const fail = (title: string) => (error: unknown) => {
    const payload = (error as ApiError).payload as
      | { detail?: { message?: string } }
      | undefined
    toast.error(title, payload?.detail?.message ?? (error as Error).message)
  }

  const start = useMutation({
    mutationFn: () => api.startTrip(tripId),
    onSuccess: (t) => {
      toast.success(`${t.code} dispatched`, 'Close each stop as the driver reports in.')
      invalidate()
    },
    onError: fail('Could not start the trip'),
  })

  const replan = useMutation({
    mutationFn: () => api.replanTrip(tripId),
    onSuccess: (t) => {
      setDraft(null)
      toast.success('Stops re-planned', `${t.stops.length} stops, ordered by deadline.`)
      invalidate()
    },
    onError: fail('Could not re-plan the stops'),
  })

  const reorder = useMutation({
    mutationFn: (stops: TripStop[]) =>
      api.reorderTrip(
        tripId,
        stops.map((stop) => ({
          stop_type: stop.stop_type,
          order_ids: stop.orders.map((o) => o.id),
        })),
      ),
    onSuccess: () => {
      setDraft(null)
      toast.success('Stop order saved')
      invalidate()
    },
    onError: fail('Stop order rejected'),
  })

  const completeStop = useMutation({
    mutationFn: (stopId: number) => api.completeStop(tripId, stopId),
    onSuccess: (t) => {
      toast.success(
        t.status === 'completed' ? `${t.code} completed` : 'Stop completed',
        t.status === 'completed'
          ? 'The truck is available again.'
          : `${t.stops_completed} of ${t.stop_count} stops done.`,
      )
      invalidate()
    },
    onError: fail('Could not complete the stop'),
  })

  const cancel = useMutation({
    mutationFn: () => api.cancelTrip(tripId),
    onSuccess: (t) => {
      toast.success(`${t.code} cancelled`, 'Unloaded orders have returned to the backlog.')
      invalidate()
    },
    onError: fail('Could not cancel the trip'),
  })

  const t: Trip | undefined = trip.data
  const stops = draft ?? t?.stops ?? []
  const nextStop = useMemo(() => stops.find((s) => s.status !== 'completed'), [stops])
  const pendingReorder = draft !== null

  // Completed stops are a locked prefix: they have already happened, so they
  // can neither be dragged nor dropped onto.
  const lockedCount = stops.filter((stop) => stop.status === 'completed').length

  const isLocked = useCallback((index: number) => index < lockedCount, [lockedCount])

  const moveStopTo = useCallback(
    (from: number, to: number) => {
      if (from < lockedCount || to < lockedCount) return
      setDraft(
        moveItem(stops, from, to).map((stop, position) => ({
          ...stop,
          sequence: position,
        })),
      )
    },
    [stops, lockedCount],
  )

  // Every hook has to run before the early returns below, so this stays here
  // rather than next to the handlers that use it.
  const sortable = useSortable({ onMove: moveStopTo, isLocked })

  if (trip.isLoading) return <Spinner label="Loading trip" />
  if (!t) return <EmptyState title="Trip not found" />

  const capacity = {
    capacity_tons: t.truck_capacity_tons ?? t.total_cargo_tons,
    current_load_tons: t.total_cargo_tons,
    available_tons: (t.truck_capacity_tons ?? t.total_cargo_tons) - t.total_cargo_tons,
    utilisation_percent: t.truck_capacity_tons
      ? Math.round((t.total_cargo_tons / t.truck_capacity_tons) * 1000) / 10
      : 100,
    order_count: t.orders.length,
  }

  const moveStop = (index: number, direction: -1 | 1) =>
    moveStopTo(index, index + direction)

  // Advisory check, so an illegal arrangement is explained before saving.
  const problem = pendingReorder
    ? sequenceProblem(
        stops.map((stop) => ({
          stop_type: stop.stop_type,
          order_ids: stop.orders.map((o) => o.id),
        })),
        new Map(t.orders.map((o) => [o.id, o.quantity_tons])),
        t.truck_capacity_tons ?? t.total_cargo_tons,
        new Map(t.orders.map((o) => [o.id, o.code])),
      )
    : null

  // There is no delivery deadline, so the clock shown is the earliest
  // collection date still outstanding. The brief order payload carries status
  // rather than timestamps, and these are the states before collection.
  const awaitingPickup = new Set(['new', 'unassigned', 'assigned', 'pickup_pending'])
  const nextPickup = t.orders
    .filter((o) => awaitingPickup.has(o.status))
    .map((o) => o.pickup_date)
    .sort()[0]

  const live = t.status === 'in_progress'

  return (
    <div className="p-6">
      <PageHeader
        back={{ to: '/trips', label: 'All trips' }}
        title={
          <>
            <span className="font-mono">{t.code}</span>
            <TripStatusBadge status={t.status} />
          </>
        }
        meta={
          <>
            <MetaItem label="Truck">
              <Link
                to={`/trucks/${t.truck_id}`}
                className="font-mono text-brand hover:underline"
              >
                {t.truck_registration}
              </Link>
            </MetaItem>
            {t.driver && (
              <MetaItem label="Driver">
                <Link to={`/drivers/${t.driver.id}`} className="text-brand hover:underline">
                  {t.driver.name}
                </Link>
                <span className="ml-2 font-normal text-ink-soft">{t.driver.phone}</span>
              </MetaItem>
            )}
            <MetaItem label="Cargo">
              {fmtTons(t.total_cargo_tons)} · {t.orders.length} orders
            </MetaItem>
          </>
        }
        actions={
          <>
            {(t.status === 'planned' || live) && (
              <>
                <Button
                  variant="danger"
                  onClick={() => cancel.mutate()}
                  disabled={cancel.isPending}
                >
                  Cancel trip
                </Button>
                <Button onClick={() => replan.mutate()} disabled={replan.isPending}>
                  {replan.isPending ? 'Re-planning…' : 'Re-plan stops'}
                </Button>
              </>
            )}
            {t.status === 'planned' && (
              <Button variant="primary" onClick={() => start.mutate()} disabled={start.isPending}>
                {start.isPending ? 'Dispatching…' : 'Start trip'}
              </Button>
            )}
          </>
        }
      />

      {t.status === 'planned' && (
        <div className="mb-4">
          <Callout tone="info">
            This trip has not been dispatched. Start it to begin closing stops.
          </Callout>
        </div>
      )}

      {/* Four figures: load, how far through, what is next, and the clock. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card px-4 py-3.5">
          <span className="label">Load</span>
          <div className="mt-2">
            <CapacityBar capacity={capacity} />
          </div>
        </div>
        <div className="card px-4 py-3.5">
          <span className="label">Stops completed</span>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
            {t.stops_completed}
            <span className="text-base font-normal text-ink-dim"> of {stops.length}</span>
          </p>
          <div className="mt-2">
            <ProgressBar
              percent={t.progress_percent}
              tone={t.status === 'completed' ? 'success' : 'brand'}
            />
          </div>
        </div>
        <div className="card px-4 py-3.5">
          <span className="label">Next stop</span>
          <p className="mt-1 truncate text-base font-semibold text-ink">
            {nextStop?.place_name ?? 'All stops done'}
          </p>
          <p className="mt-0.5 text-xs text-ink-dim">
            {nextStop
              ? nextStop.stop_type === 'pickup'
                ? 'Collect here'
                : 'Deliver here'
              : '—'}
          </p>
        </div>
        <div className="card px-4 py-3.5">
          <span className="label">Next collection</span>
          <p className="mt-1 text-base font-semibold text-ink">
            {nextPickup ? fmtDayRelative(nextPickup) : '—'}
          </p>
          <p className="mt-0.5 text-xs text-ink-dim">
            {nextPickup ? fmtDay(nextPickup) : 'Everything collected'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Panel
          title="Stops"
          description={
            t.status === 'completed' || t.status === 'cancelled'
              ? `${stops.length} stops`
              : `${stops.length} stops · drag, or use the arrows, to reorder`
          }
          actions={
            pendingReorder ? (
              <>
                <Button size="sm" onClick={() => setDraft(null)}>
                  Reset
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => reorder.mutate(stops)}
                  disabled={reorder.isPending || problem !== null}
                >
                  {reorder.isPending ? 'Saving…' : 'Save order'}
                </Button>
              </>
            ) : null
          }
          bodyClassName=""
        >
          {pendingReorder && (
            <div className="border-b border-line p-4">
              {problem ? (
                <Callout tone="danger">{problem}</Callout>
              ) : (
                <Callout tone="warning">
                  Stop order changed but not saved yet.
                </Callout>
              )}
            </div>
          )}
          {stops.length === 0 ? (
            <EmptyState title="No stops planned" />
          ) : (
            <ol className="divide-y divide-line">
              {stops.map((stop, index) => (
                <StopRow
                  key={stop.id}
                  stop={stop}
                  isNext={nextStop?.id === stop.id && !pendingReorder}
                  isLast={index === stops.length - 1}
                  canReorder={{
                    up: index > lockedCount,
                    down: !isLocked(index) && index < stops.length - 1,
                  }}
                  onMove={(direction) => moveStop(index, direction)}
                  onComplete={() => completeStop.mutate(stop.id)}
                  completing={completeStop.isPending && completeStop.variables === stop.id}
                  disableComplete={pendingReorder || !live || nextStop?.id !== stop.id}
                  dragProps={sortable.itemProps(index)}
                  dragIndicator={sortable.indicator(index)}
                  isBeingDragged={sortable.dragIndex === index}
                  reorderable={!isLocked(index)}
                />
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Truck and driver">
          <div className="space-y-4 p-5">
            <Stat
              label="Truck"
              value={
                <Link
                  to={`/trucks/${t.truck_id}`}
                  className="font-mono font-medium text-brand hover:underline"
                >
                  {t.truck_registration}
                </Link>
              }
            />
            <Stat label="Rated capacity" value={fmtTons(t.truck_capacity_tons)} mono />
            <Stat
              label="Driver"
              value={
                t.driver ? (
                  <Link
                    to={`/drivers/${t.driver.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {t.driver.name}
                  </Link>
                ) : (
                  <span className="text-ink-dim">Unassigned</span>
                )
              }
            />
            {t.driver && (
              <Stat
                label="Phone"
                value={
                  <a
                    href={`tel:${t.driver.phone.replace(/\s/g, '')}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {t.driver.phone}
                  </a>
                }
              />
            )}
            <Stat
              label="Started"
              value={t.started_at ? fmtDateTime(t.started_at) : 'Not started'}
            />
            {t.completed_at && (
              <Stat label="Completed" value={fmtDateTime(t.completed_at)} />
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Orders on this trip" description={`${t.orders.length} total`} className="mt-4">
        <Table
          minWidth="58rem"
          head={
            <>
              <Th>Order</Th>
              <Th>Billing party</Th>
              <Th align="right">Weight</Th>
              <Th>Pickup</Th>
              <Th>Drop</Th>
              <Th align="right">Pickup date</Th>
              <Th>Status</Th>
            </>
          }
        >
          {t.orders.map((order) => (
            <Tr key={order.id} to={`/orders/${order.id}`}>
              <Td>
                <Link
                  to={`/orders/${order.id}`}
                  className="font-mono text-sm font-medium text-ink hover:text-brand"
                >
                  {order.code}
                </Link>
                <div className="truncate text-xs text-ink-dim">{order.material}</div>
              </Td>
              <Td className="max-w-40">
                <span className="block truncate">{order.billing_party}</span>
              </Td>
              <Td align="right" className="font-medium tabular-nums">
                {fmtTons(order.quantity_tons)}
              </Td>
              <Td className="text-ink-soft">{order.pickup_name}</Td>
              <Td className="text-ink-soft">{order.drop_name}</Td>
              <Td align="right">
                {fmtDayRelative(order.pickup_date)}
                <div className="text-xs text-ink-dim">{fmtDay(order.pickup_date)}</div>
              </Td>
              <Td>
                <OrderStatusBadge status={order.status} size="sm" />
              </Td>
            </Tr>
          ))}
        </Table>
      </Panel>
    </div>
  )
}
