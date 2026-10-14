import clsx from 'clsx'
import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { fmtDateTime, fmtDay, fmtDayRelative, fmtTons } from '../lib/format'
import { sequenceProblem } from '../lib/sequence'
import type { Trip, TripStop } from '../lib/types'
import { moveItem, useSortable, type SortableItemProps } from '../components/sortable'
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconGrip,
  IconPhone,
  IconTrips,
} from '../components/icons'
import { PickupWhen, Route } from '../components/orderBits'
import { PageBody, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Avatar,
  Button,
  Callout,
  CapacityBar,
  Code,
  EmptyState,
  FactList,
  IconButton,
  ListCard,
  Modal,
  OrderStatusBadge,
  Panel,
  ProgressBar,
  ResponsiveList,
  Spinner,
  StickyActionBar,
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
  const movable = !done && (canReorder.up || canReorder.down)

  return (
    <li
      {...dragProps}
      className={clsx(
        'relative flex gap-3.5 px-4 py-4 transition-colors sm:gap-4 sm:px-5',
        isNext && 'bg-brand-tint/50',
        reorderable && !done && 'lg:cursor-grab lg:active:cursor-grabbing',
        isBeingDragged && 'opacity-40',
      )}
    >
      {/* Insertion line showing where the dragged stop would land. */}
      {dragIndicator && (
        <span
          aria-hidden
          className={clsx(
            'pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-brand',
            dragIndicator === 'above' ? '-top-px' : '-bottom-px',
          )}
        />
      )}

      {/* Rail */}
      <div className="flex flex-col items-center">
        <span
          className={clsx(
            'grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums',
            done
              ? 'bg-st-available text-white'
              : isNext
                ? 'bg-surface-1 text-brand ring-2 ring-brand'
                : 'bg-surface-1 text-ink-dim ring-1 ring-line-strong',
          )}
        >
          {done ? <IconCheck size={16} strokeWidth={2.2} /> : stop.sequence + 1}
        </span>
        {!isLast && (
          <span
            className={clsx(
              'mt-2 -mb-4 w-0.5 flex-1 rounded-full',
              done ? 'bg-st-available/40' : 'bg-line',
            )}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StopTypeBadge type={stop.stop_type} />
          {isNext && !done && (
            <span className="text-xs font-semibold text-brand">Next stop</span>
          )}
        </div>
        <p className="mt-1.5 text-base font-semibold text-ink">{stop.place_name}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{stop.place_address}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {stop.place_phone && (
            <a
              href={`tel:${stop.place_phone.replace(/\s/g, '')}`}
              className="inline-flex items-center gap-1.5 font-mono font-medium text-ink-soft hover:text-brand"
            >
              <IconPhone size={13} />
              {stop.place_phone}
            </a>
          )}
          {done && (
            <span className="font-medium text-st-available">
              Done {fmtDateTime(stop.completed_at)}
            </span>
          )}
        </div>

        {stop.orders.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stop.orders.map((order) => (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-surface-1 px-2 text-xs ring-1 ring-line transition-colors hover:text-brand hover:ring-brand/40"
              >
                <span className="font-mono font-medium">{order.code}</span>
                <span className="text-ink-dim">{fmtTons(order.quantity_tons)}</span>
              </Link>
            ))}
          </div>
        )}

        {!done && (
          <div className="mt-3.5 flex items-center gap-2 sm:hidden">
            <Button
              size="sm"
              variant={isNext && !disableComplete ? 'primary' : 'secondary'}
              onClick={onComplete}
              disabled={completing || disableComplete}
              className="flex-1"
            >
              {completing
                ? 'Saving…'
                : stop.stop_type === 'pickup'
                  ? 'Mark picked up'
                  : 'Mark delivered'}
            </Button>
            {movable && (
              <>
                <IconButton
                  label={`Move ${stop.place_name} earlier`}
                  variant="secondary"
                  onClick={() => onMove(-1)}
                  disabled={!canReorder.up}
                >
                  <IconArrowUp size={17} />
                </IconButton>
                <IconButton
                  label={`Move ${stop.place_name} later`}
                  variant="secondary"
                  onClick={() => onMove(1)}
                  disabled={!canReorder.down}
                >
                  <IconArrowDown size={17} />
                </IconButton>
              </>
            )}
          </div>
        )}
      </div>

      {!done && (
        <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
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
          {movable && (
            <div className="flex items-center gap-1">
              {/* The row itself is the drag handle; the grip just says so. */}
              <span aria-hidden title="Drag to reorder" className="hidden px-1 text-ink-dim lg:block">
                <IconGrip size={15} />
              </span>
              <IconButton
                label={`Move ${stop.place_name} earlier`}
                onClick={() => onMove(-1)}
                disabled={!canReorder.up}
                className="sm:size-8"
              >
                <IconArrowUp size={15} />
              </IconButton>
              <IconButton
                label={`Move ${stop.place_name} later`}
                onClick={() => onMove(1)}
                disabled={!canReorder.down}
                className="sm:size-8"
              >
                <IconArrowDown size={15} />
              </IconButton>
            </div>
          )}
        </div>
      )}
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
  const [confirmCancel, setConfirmCancel] = useState(false)

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
      toast.success('Stops re-planned', `${t.stops.length} stops, collected in pickup-date order.`)
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
      setConfirmCancel(false)
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

  if (trip.isLoading)
    return (
      <PageBody>
        <Spinner label="Loading trip" />
      </PageBody>
    )
  if (!t)
    return (
      <PageBody>
        <EmptyState icon={<IconTrips size={20} />} title="Trip not found" />
      </PageBody>
    )

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

  const editable = t.status === 'planned' || live

  return (
    <PageBody className={clsx(pendingReorder && 'max-lg:pb-28')}>
      <PageHeader
        back={{ to: '/trips', label: 'Trips' }}
        eyebrow="Trip"
        title={
          <>
            <span className="font-mono tracking-tight">{t.code}</span>
            <TripStatusBadge status={t.status} />
          </>
        }
        subtitle={
          <>
            <Link to={`/trucks/${t.truck_id}`} className="font-mono font-medium text-ink hover:text-brand">
              {t.truck_registration}
            </Link>
            {t.driver && (
              <>
                {' · '}
                <Link to={`/drivers/${t.driver.id}`} className="font-medium text-ink hover:text-brand">
                  {t.driver.name}
                </Link>
              </>
            )}
            {' · '}
            {fmtTons(t.total_cargo_tons)} across {t.orders.length}{' '}
            {t.orders.length === 1 ? 'order' : 'orders'}
          </>
        }
        actions={
          editable ? (
            <>
              <Button onClick={() => replan.mutate()} disabled={replan.isPending}>
                {replan.isPending ? 'Re-planning…' : 'Re-plan stops'}
              </Button>
              {t.status === 'planned' && (
                <Button variant="primary" onClick={() => start.mutate()} disabled={start.isPending}>
                  {start.isPending ? 'Dispatching…' : 'Start trip'}
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {t.status === 'planned' && (
        <div className="mb-4">
          <Callout tone="info">
            This trip has not been dispatched yet. Start it to begin closing stops.
          </Callout>
        </div>
      )}

      {/* One strip, four facts: load, progress, what is next, and the clock. */}
      <section className="card grid grid-cols-2 gap-px overflow-hidden bg-line xl:grid-cols-4 [&>*]:bg-surface-1 [&>*]:px-4 [&>*]:py-4 sm:[&>*]:px-5">
        <div>
          <p className="text-sm text-ink-dim">Load</p>
          <div className="mt-2">
            <CapacityBar capacity={capacity} size="sm" />
          </div>
        </div>
        <div>
          <p className="text-sm text-ink-dim">Stops done</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink">
            {t.stops_completed}
            <span className="text-sm font-normal text-ink-dim"> of {stops.length}</span>
          </p>
          <div className="mt-1.5">
            <ProgressBar
              percent={t.progress_percent}
              tone={t.status === 'completed' ? 'success' : 'brand'}
            />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-ink-dim">Next stop</p>
          <p className="mt-1 truncate font-semibold text-ink">
            {nextStop?.place_name ?? 'All stops done'}
          </p>
          <p className="mt-0.5 text-xs text-ink-dim">
            {nextStop ? (nextStop.stop_type === 'pickup' ? 'Collect here' : 'Deliver here') : '—'}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-ink-dim">Next collection</p>
          <p className="mt-1 truncate font-semibold text-ink">
            {nextPickup ? fmtDayRelative(nextPickup) : '—'}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-dim">
            {nextPickup ? fmtDay(nextPickup) : 'Everything collected'}
          </p>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Panel
          title="Stops"
          description={
            editable
              ? `${stops.length} stops · drag, or use the arrows, to reorder`
              : `${stops.length} stops`
          }
          actions={
            pendingReorder ? (
              <div className="hidden items-center gap-2 lg:flex">
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
              </div>
            ) : null
          }
          bodyClassName=""
        >
          {pendingReorder && (
            <div className="border-b border-line p-4">
              {problem ? (
                <Callout tone="danger">{problem}</Callout>
              ) : (
                <Callout tone="warning">The stop order has changed but is not saved yet.</Callout>
              )}
            </div>
          )}
          {stops.length === 0 ? (
            <EmptyState title="No stops planned" />
          ) : (
            <ol>
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

        <div className="space-y-4">
          <Panel title="Truck and driver" bodyClassName="">
            {t.driver && (
              <div className="flex items-center gap-3 border-b border-line px-4 py-4 sm:px-5">
                <Avatar name={t.driver.name} size={40} tone="brand" />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/drivers/${t.driver.id}`}
                    className="block truncate font-semibold text-ink hover:text-brand"
                  >
                    {t.driver.name}
                  </Link>
                  <p className="truncate font-mono text-xs text-ink-dim">{t.driver.phone}</p>
                </div>
                <a
                  href={`tel:${t.driver.phone.replace(/\s/g, '')}`}
                  aria-label={`Call ${t.driver.name}`}
                  className="grid size-10 place-items-center rounded-full bg-st-available/10 text-st-available transition-colors hover:bg-st-available/20"
                >
                  <IconPhone size={18} />
                </a>
              </div>
            )}
            <FactList
              items={[
                {
                  label: 'Truck',
                  value: (
                    <Code to={`/trucks/${t.truck_id}`} className="text-brand">
                      {t.truck_registration}
                    </Code>
                  ),
                },
                { label: 'Rated capacity', value: fmtTons(t.truck_capacity_tons) },
                !t.driver && { label: 'Driver', value: 'Unassigned' },
                { label: 'Started', value: t.started_at ? fmtDateTime(t.started_at) : 'Not started' },
                t.completed_at ? { label: 'Completed', value: fmtDateTime(t.completed_at) } : null,
              ]}
            />
          </Panel>

          {editable && (
            <div className="rounded-xl border border-dashed border-line-strong px-4 py-3.5 sm:px-5">
              <p className="text-sm font-medium text-ink">Cancel this trip</p>
              <p className="mt-0.5 text-sm text-ink-dim">
                Orders not yet collected go back to the backlog.
              </p>
              <Button
                size="sm"
                variant="danger"
                className="mt-3"
                onClick={() => setConfirmCancel(true)}
              >
                Cancel trip
              </Button>
            </div>
          )}
        </div>
      </div>

      <Panel
        title="Orders on this trip"
        description={`${t.orders.length} ${t.orders.length === 1 ? 'order' : 'orders'}`}
        className="mt-4"
        bodyClassName=""
      >
        <ResponsiveList
          breakpoint="xl"
          cards={
            <ul className="divide-y divide-line">
              {t.orders.map((order) => (
                <ListCard key={order.id} to={`/orders/${order.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Code to={`/orders/${order.id}`} className="font-semibold">
                        {order.code}
                      </Code>
                      <p className="mt-0.5 truncate text-sm text-ink">
                        {order.material}
                        <span className="text-ink-dim"> · {fmtTons(order.quantity_tons)}</span>
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} size="sm" />
                  </div>
                  <div className="mt-2.5">
                    <Route from={order.pickup_name} to={order.drop_name} />
                  </div>
                  <p className="mt-2 truncate text-xs text-ink-dim">{order.billing_party}</p>
                </ListCard>
              ))}
            </ul>
          }
          table={
            <Table
              minWidth="56rem"
              head={
                <>
                  <Th>Order</Th>
                  <Th>Billing party</Th>
                  <Th>Route</Th>
                  <Th align="right">Weight</Th>
                  <Th>Pickup</Th>
                  <Th>Status</Th>
                </>
              }
            >
              {t.orders.map((order) => (
                <Tr key={order.id} to={`/orders/${order.id}`}>
                  <Td>
                    <Code to={`/orders/${order.id}`} className="font-semibold">
                      {order.code}
                    </Code>
                    <div className="mt-0.5 truncate text-xs text-ink-dim">{order.material}</div>
                  </Td>
                  <Td className="max-w-44">
                    <span className="block truncate">{order.billing_party}</span>
                  </Td>
                  <Td className="max-w-64">
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
                    <OrderStatusBadge status={order.status} size="sm" />
                  </Td>
                </Tr>
              ))}
            </Table>
          }
        />
      </Panel>

      {/* On a phone the save controls ride with the thumb, not at the top of a long list. */}
      {pendingReorder && (
        <StickyActionBar>
          {problem && <p className="mb-2 text-xs font-medium text-st-delayed">{problem}</p>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setDraft(null)}>
              Reset
            </Button>
            <Button
              variant="primary"
              className="flex-[2]"
              onClick={() => reorder.mutate(stops)}
              disabled={reorder.isPending || problem !== null}
            >
              {reorder.isPending ? 'Saving…' : 'Save stop order'}
            </Button>
          </div>
        </StickyActionBar>
      )}

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={`Cancel ${t.code}?`}
        description="The truck is released. Orders that have not been collected return to the backlog to be assigned again."
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setConfirmCancel(false)}>Keep trip</Button>
            <Button
              variant="danger"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel trip'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          {t.stops_completed > 0
            ? `${t.stops_completed} of ${stops.length} stops are already done and stay on record.`
            : 'No stops have been completed yet.'}
        </p>
      </Modal>
    </PageBody>
  )
}
