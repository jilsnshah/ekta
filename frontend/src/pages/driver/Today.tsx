import clsx from 'clsx'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDateTime, fmtTons } from '../../lib/format'
import type { DriverStop, DriverTrip } from '../../lib/types'
import { DriverPageTitle } from '../../components/driverShell'
import { useToast } from '../../components/toast'
import {
  Button,
  Callout,
  EmptyState,
  Field,
  Modal,
  Panel,
  ProgressBar,
  Spinner,
  textareaClass,
} from '../../components/ui'

/** A map link, so the driver can hand the address to their own navigation. */
function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** What to load or hand over at a stop. */
function Manifest({ stop }: { stop: DriverStop }) {
  if (stop.orders.length === 0) return null
  const verb = stop.stop_type === 'pickup' ? 'Collect' : 'Hand over'
  return (
    <div>
      <p className="label mb-2">
        {verb} · {stop.orders.length} consignment{stop.orders.length > 1 ? 's' : ''}
      </p>
      <ul className="space-y-2">
        {stop.orders.map((order) => (
          <li
            key={order.code}
            className="rounded-md border border-line bg-surface-2 px-3 py-2.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-sm font-semibold text-ink">
                {order.code}
              </span>
              <span className="shrink-0 text-base font-semibold tabular-nums text-ink">
                {fmtTons(order.quantity_tons)}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-ink">{order.material}</p>
            <p className="text-xs text-ink-dim">
              {order.billing_party}
              {order.order_number && ` · ${order.order_number}`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The stop the driver is working now: the one thing that matters. */
function NextStopCard({
  stop,
  trip,
  onComplete,
  completing,
  canComplete,
}: {
  stop: DriverStop
  trip: DriverTrip
  onComplete: () => void
  completing: boolean
  canComplete: boolean
}) {
  const isPickup = stop.stop_type === 'pickup'

  return (
    <section
      className={clsx(
        'rounded-xl border-2 bg-surface-1 p-5',
        isPickup ? 'border-st-pickup/40' : 'border-st-delivery/40',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={clsx(
            'inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold',
            isPickup
              ? 'border-st-pickup/25 bg-st-pickup/10 text-st-pickup'
              : 'border-st-delivery/25 bg-st-delivery/10 text-st-delivery',
          )}
        >
          {isPickup ? 'COLLECT' : 'DELIVER'}
        </span>
        <span className="text-sm text-ink-dim">
          Stop {stop.sequence + 1} of {trip.stop_count}
        </span>
      </div>

      <h2 className="mt-3 text-xl leading-snug font-semibold text-ink">
        {stop.place_name}
      </h2>
      <p className="mt-1.5 text-base leading-relaxed text-ink-soft">
        {stop.place_address}
      </p>

      {/* The two things a driver reaches for on arrival. */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <a
          href={mapsHref(stop.place_address)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 items-center justify-center rounded-md border border-line bg-surface-1 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
        >
          Open in Maps
        </a>
        {stop.place_phone ? (
          <a
            href={`tel:${stop.place_phone.replace(/\s/g, '')}`}
            className="flex h-12 items-center justify-center rounded-md border border-line bg-surface-1 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            Call site
          </a>
        ) : (
          <span className="flex h-12 items-center justify-center rounded-md border border-line bg-surface-2 text-sm text-ink-dim">
            No site number
          </span>
        )}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <Manifest stop={stop} />
      </div>

      <p className="mt-4 text-sm text-ink-dim">
        On board after this stop:{' '}
        <span className="font-semibold text-ink">{fmtTons(stop.load_after_tons)}</span> of{' '}
        {fmtTons(trip.truck_capacity_tons)}
      </p>

      <Button
        variant="primary"
        className="mt-4 h-14 w-full text-base"
        disabled={completing || !canComplete}
        onClick={onComplete}
      >
        {completing
          ? 'Saving…'
          : isPickup
            ? 'Mark collected'
            : 'Mark delivered'}
      </Button>
      {!canComplete && (
        <p className="mt-2 text-center text-sm text-ink-dim">
          Start the trip first.
        </p>
      )}
    </section>
  )
}

/** The run ahead, so the driver can see what is coming. */
function StopList({ trip }: { trip: DriverTrip }) {
  return (
    <ol className="divide-y divide-line">
      {trip.stops.map((stop) => {
        const done = stop.status === 'completed'
        const isNext = trip.next_stop?.id === stop.id
        return (
          <li
            key={stop.id}
            className={clsx('flex gap-3 px-4 py-3.5', isNext && 'bg-brand-tint/60')}
          >
            <span
              className={clsx(
                'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold',
                done
                  ? 'border-st-available bg-st-available text-on-brand'
                  : isNext
                    ? 'border-brand text-brand'
                    : 'border-line text-ink-dim',
              )}
            >
              {done ? '✓' : stop.sequence + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={clsx(
                    'truncate text-sm',
                    done ? 'text-ink-dim' : 'font-medium text-ink',
                  )}
                >
                  {stop.place_name}
                </p>
                <span
                  className={clsx(
                    'shrink-0 text-xs font-semibold',
                    stop.stop_type === 'pickup' ? 'text-st-pickup' : 'text-st-delivery',
                  )}
                >
                  {stop.stop_type === 'pickup' ? 'COLLECT' : 'DELIVER'}
                </span>
              </div>
              <p className="truncate text-xs text-ink-dim">
                {done
                  ? `Done ${fmtDateTime(stop.completed_at)}`
                  : `${stop.orders.length} consignment${stop.orders.length > 1 ? 's' : ''} · ${fmtTons(
                      stop.orders.reduce((sum, o) => sum + o.quantity_tons, 0),
                    )}`}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function DelayModal({
  open,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
  busy: boolean
}) {
  const [reason, setReason] = useState('')
  const presets = [
    'Stuck in traffic',
    'Vehicle breakdown',
    'Waiting at the gate',
    'Loading delayed',
    'Road blocked',
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report a delay"
      description="The control room is told straight away."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={reason.trim().length < 3 || busy}
            onClick={() => onSubmit(reason.trim())}
          >
            {busy ? 'Sending…' : 'Report delay'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              onClick={() => setReason(preset)}
              className={clsx(
                'h-9 rounded-md border px-3 text-sm font-medium transition-colors',
                reason === preset
                  ? 'border-brand bg-brand-tint text-brand'
                  : 'border-line bg-surface-1 text-ink-soft hover:bg-surface-2',
              )}
            >
              {preset}
            </button>
          ))}
        </div>
        <Field label="What is the hold-up?">
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Highway blocked past Bagodara"
            className={textareaClass}
          />
        </Field>
      </div>
    </Modal>
  )
}

export default function DriverToday() {
  const { driver } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [delayOpen, setDelayOpen] = useState(false)
  const [confirming, setConfirming] = useState<DriverStop | null>(null)

  const trip = useQuery({
    queryKey: ['driver-trip'],
    queryFn: () => api.driverApp.currentTrip(),
    refetchInterval: 30_000,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['driver-trip'] })
    void queryClient.invalidateQueries({ queryKey: ['driver-history'] })
  }

  const fail = (title: string) => (error: unknown) => {
    const payload = (error as ApiError).payload as
      | { detail?: { message?: string } }
      | undefined
    toast.error(title, payload?.detail?.message ?? (error as Error).message)
  }

  const t = trip.data ?? null

  const start = useMutation({
    mutationFn: () => api.driverApp.startTrip(t!.id),
    onSuccess: () => {
      toast.success('Trip started', 'Close each stop as you complete it.')
      invalidate()
    },
    onError: fail('Could not start the trip'),
  })

  const complete = useMutation({
    mutationFn: (stopId: number) => api.driverApp.completeStop(t!.id, stopId),
    onSuccess: (updated) => {
      setConfirming(null)
      toast.success(
        updated.next_stop ? 'Stop closed' : 'Trip complete',
        updated.next_stop
          ? `Next: ${updated.next_stop.place_name}`
          : 'Nothing left on this run. Well done.',
      )
      invalidate()
    },
    onError: (error) => {
      setConfirming(null)
      fail('Could not close the stop')(error)
    },
  })

  const reportDelay = useMutation({
    mutationFn: (reason: string) => api.driverApp.reportDelay(t!.id, reason),
    onSuccess: () => {
      setDelayOpen(false)
      toast.success('Delay reported', 'The control room has been told.')
      invalidate()
    },
    onError: fail('Could not report the delay'),
  })

  const clearDelay = useMutation({
    mutationFn: () => api.driverApp.clearDelay(t!.id),
    onSuccess: () => {
      toast.success('Marked as moving again')
      invalidate()
    },
    onError: fail('Could not clear the delay'),
  })

  if (trip.isLoading) return <Spinner label="Loading your trip" />

  if (!driver?.truck_registration) {
    return (
      <>
        <DriverPageTitle title="No truck assigned" />
        <Panel>
          <EmptyState
            title="You are not on a truck yet"
            hint="The control room needs to assign you one before you can be given a trip."
          />
        </Panel>
      </>
    )
  }

  if (!t) {
    return (
      <>
        <DriverPageTitle
          title="Nothing to run"
          subtitle={`${driver.truck_registration} has no trip assigned right now.`}
        />
        <Panel>
          <EmptyState
            title="No trip assigned"
            hint="This screen updates on its own when the control room gives you one."
          />
        </Panel>
      </>
    )
  }

  const notStarted = t.status === 'planned'

  return (
    <>
      <DriverPageTitle
        title={<span className="font-mono">{t.code}</span>}
        subtitle={
          `${t.truck_registration} · ${fmtTons(t.total_cargo_tons)} on board · ` +
          `${t.stops_completed} of ${t.stop_count} stops done`
        }
      />

      <div className="space-y-4">
        <div className="card p-4">
          <ProgressBar
            percent={t.progress_percent}
            label="Trip progress"
            tone={t.status === 'completed' ? 'success' : 'brand'}
          />
        </div>

        {t.is_delayed && (
          <Callout tone="danger">
            This trip is flagged delayed.{' '}
            <button
              onClick={() => clearDelay.mutate()}
              disabled={clearDelay.isPending}
              className="font-semibold underline hover:no-underline"
            >
              I am moving again
            </button>
          </Callout>
        )}

        {notStarted && (
          <section className="card p-5">
            <h2 className="text-base font-semibold text-ink">Ready to roll?</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Start the trip when you set off. The control room and the customer both
              see it immediately.
            </p>
            <Button
              variant="primary"
              className="mt-4 h-14 w-full text-base"
              disabled={start.isPending}
              onClick={() => start.mutate()}
            >
              {start.isPending ? 'Starting…' : 'Start trip'}
            </Button>
          </section>
        )}

        {t.next_stop ? (
          <NextStopCard
            stop={t.next_stop}
            trip={t}
            canComplete={!notStarted}
            completing={complete.isPending}
            onComplete={() => setConfirming(t.next_stop!)}
          />
        ) : (
          <Panel>
            <EmptyState
              title="All stops done"
              hint="This trip is complete and your truck is free again."
            />
          </Panel>
        )}

        <Panel title="The whole run" description={`${t.stop_count} stops`}>
          <StopList trip={t} />
        </Panel>

        {!notStarted && !t.is_delayed && t.next_stop && (
          <Button
            variant="danger"
            className="h-12 w-full"
            onClick={() => setDelayOpen(true)}
          >
            Report a delay
          </Button>
        )}
      </div>

      {/*
        Closing a stop moves the order on for the control room and the
        customer, and the driver cannot undo it, so it asks first.
      */}
      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={
          confirming?.stop_type === 'pickup' ? 'Confirm collection' : 'Confirm delivery'
        }
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Not yet</Button>
            <Button
              variant="primary"
              disabled={complete.isPending}
              onClick={() => confirming && complete.mutate(confirming.id)}
            >
              {complete.isPending ? 'Saving…' : 'Yes, confirm'}
            </Button>
          </>
        }
      >
        {confirming && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              {confirming.stop_type === 'pickup'
                ? 'Have you loaded everything listed below at'
                : 'Have you handed over everything listed below at'}{' '}
              <span className="font-semibold">{confirming.place_name}</span>?
            </p>
            <Manifest stop={confirming} />
            <p className="text-xs text-ink-dim">
              This cannot be undone from the app. Call the control room if you tap it
              by mistake.
            </p>
          </div>
        )}
      </Modal>

      <DelayModal
        open={delayOpen}
        onClose={() => setDelayOpen(false)}
        onSubmit={(reason) => reportDelay.mutate(reason)}
        busy={reportDelay.isPending}
      />
    </>
  )
}
