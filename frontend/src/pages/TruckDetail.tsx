import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtDate, fmtNumber, fmtTons, titleCase } from '../lib/format'
import { OPERATOR_SETTABLE_STATUSES, TRUCK_STATUS } from '../lib/status'
import { IconAssign, IconEdit, IconPhone, IconTrips, IconTruck } from '../components/icons'
import { PageBody, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import { OrdersOnBoard, TripHistoryList } from '../components/tripList'
import {
  Avatar,
  Button,
  Callout,
  CapacityBar,
  Code,
  EmptyState,
  FactList,
  LinkButton,
  Pagination,
  Panel,
  ProgressBar,
  Spinner,
  TruckStatusBadge,
} from '../components/ui'
import { TruckForm } from './Trucks'

export default function TruckDetail() {
  const { id } = useParams()
  const truckId = Number(id)
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)

  const truck = useQuery({
    queryKey: ['truck', truckId],
    queryFn: () => api.truck(truckId),
    enabled: Number.isFinite(truckId),
    refetchInterval: 45_000,
  })

  // A truck accumulates trips for years, so its history is paged like any
  // other list rather than fetched whole.
  const trips = usePaged({
    key: ['truck-trips', truckId],
    filters: {},
    fetchPage: (params) => api.truckTrips(truckId, params),
    pageSize: 10,
  })

  const setStatus = useMutation({
    mutationFn: (status: string) => api.setTruckStatus(truckId, status),
    onSuccess: (updated) => {
      toast.success(`${updated.registration_number} set to ${titleCase(updated.status)}`)
      void queryClient.invalidateQueries({ queryKey: ['truck', truckId] })
      void queryClient.invalidateQueries({ queryKey: ['trucks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error) => {
      const payload = (error as ApiError).payload as { detail?: string } | undefined
      toast.error(
        'Could not change status',
        typeof payload?.detail === 'string' ? payload.detail : (error as Error).message,
      )
    },
  })

  if (truck.isLoading)
    return (
      <PageBody>
        <Spinner label="Loading truck" />
      </PageBody>
    )
  if (!truck.data)
    return (
      <PageBody>
        <EmptyState icon={<IconTruck size={20} />} title="Truck not found" />
      </PageBody>
    )

  const t = truck.data
  const onTrip = Boolean(t.current_trip_id)

  return (
    <PageBody>
      <PageHeader
        back={{ to: '/trucks', label: 'Trucks' }}
        eyebrow="Truck"
        title={
          <>
            <span className="font-mono tracking-tight">{t.registration_number}</span>
            <TruckStatusBadge status={t.status} />
          </>
        }
        subtitle={
          <>
            {fmtTons(t.capacity_tons)} capacity
            {t.base_city && <> · based in {t.base_city}</>}
            {t.driver && (
              <>
                {' · driven by '}
                <Link to={`/drivers/${t.driver.id}`} className="font-medium text-ink hover:text-brand">
                  {t.driver.name}
                </Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <Button onClick={() => setEditing(true)}>
              <IconEdit size={16} />
              Edit
            </Button>
            {onTrip && (
              <LinkButton to={`/trips/${t.current_trip_id}`} variant="primary">
                <IconTrips size={16} />
                Open {t.current_trip_code}
              </LinkButton>
            )}
          </>
        }
      />

      {!t.driver && (
        <div className="mb-4">
          <Callout tone="warning">
            No driver assigned — this truck cannot be dispatched.{' '}
            <button
              onClick={() => setEditing(true)}
              className="font-semibold underline hover:no-underline"
            >
              Assign a driver
            </button>
          </Callout>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-4">
          <Panel
            title="Load on board"
            description={`${t.capacity.order_count} ${t.capacity.order_count === 1 ? 'order' : 'orders'} · ${fmtTons(t.capacity.available_tons)} free`}
            bodyClassName=""
          >
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <CapacityBar capacity={t.capacity} />
            </div>
            {t.orders.length === 0 ? (
              <EmptyState
                icon={<IconTruck size={20} />}
                title="Nothing on board"
                hint="This truck is empty and ready to load."
                action={
                  <LinkButton to="/assign" variant="primary" size="sm">
                    <IconAssign size={15} />
                    Assign orders
                  </LinkButton>
                }
              />
            ) : (
              <OrdersOnBoard orders={t.orders} />
            )}
          </Panel>

          <Panel
            title="Trip history"
            description={`${trips.page.total.toLocaleString('en-IN')} ${trips.page.total === 1 ? 'trip' : 'trips'}`}
            bodyClassName=""
          >
            {trips.isInitialLoading ? (
              <Spinner rows={3} />
            ) : trips.items.length === 0 ? (
              <EmptyState
                icon={<IconTrips size={20} />}
                title="No trips yet"
                hint="Assign orders to this truck to create its first trip."
              />
            ) : (
              <TripHistoryList trips={trips.items} show="driver" />
            )}
            {trips.items.length > 0 && (
              <Pagination
                page={trips.page}
                onPage={trips.setPage}
                pageSize={trips.pageSize}
                onPageSize={trips.setPageSize}
                noun="trips"
                busy={trips.isPlaceholderData}
              />
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          {onTrip && (
            <Panel title="Current trip" bodyClassName="">
              <div className="space-y-3 px-4 py-4 sm:px-5">
                <div className="flex items-baseline justify-between gap-3">
                  <Code to={`/trips/${t.current_trip_id}`} className="font-semibold text-brand">
                    {t.current_trip_code}
                  </Code>
                  <span className="text-sm text-ink-dim tabular-nums">
                    {t.stops_remaining != null
                      ? `${t.stops_remaining} ${t.stops_remaining === 1 ? 'stop' : 'stops'} left`
                      : ''}
                  </span>
                </div>
                <ProgressBar percent={t.trip_progress_percent ?? 0} />
                <p className="text-sm text-ink-soft">
                  {t.next_stop ? (
                    <>
                      Next:{' '}
                      <span
                        className={
                          t.next_stop_type === 'pickup'
                            ? 'font-medium text-st-pickup'
                            : 'font-medium text-st-delivery'
                        }
                      >
                        {t.next_stop_type === 'pickup' ? 'pick up' : 'deliver'}
                      </span>{' '}
                      at <span className="font-medium text-ink">{t.next_stop}</span>
                    </>
                  ) : (
                    'Awaiting dispatch'
                  )}
                </p>
              </div>
            </Panel>
          )}

          <Panel title="Driver" bodyClassName="">
            {t.driver ? (
              <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
                <Avatar name={t.driver.name} size={40} tone="brand" />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/drivers/${t.driver.id}`}
                    className="block truncate font-semibold text-ink hover:text-brand"
                  >
                    {t.driver.name}
                  </Link>
                  <p className="truncate font-mono text-xs text-ink-dim">
                    {t.driver.license_number}
                  </p>
                </div>
                <a
                  href={`tel:${t.driver.phone.replace(/\s/g, '')}`}
                  aria-label={`Call ${t.driver.name}`}
                  title={t.driver.phone}
                  className="grid size-10 place-items-center rounded-full bg-st-available/10 text-st-available transition-colors hover:bg-st-available/20"
                >
                  <IconPhone size={18} />
                </a>
              </div>
            ) : (
              <div className="px-4 py-4 sm:px-5">
                <p className="text-sm text-ink-dim">Nobody is driving this truck.</p>
                <Button size="sm" className="mt-3" onClick={() => setEditing(true)}>
                  Assign a driver
                </Button>
              </div>
            )}
          </Panel>

          <Panel
            title="Status"
            description="Assigned and in transit follow the trip automatically."
            bodyClassName=""
          >
            <div className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
              {OPERATOR_SETTABLE_STATUSES.map((option) => {
                const current = t.status === option
                const disabled =
                  setStatus.isPending || current || (option === 'available' && onTrip)
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={disabled}
                    aria-pressed={current}
                    title={
                      option === 'available' && onTrip
                        ? 'Complete or cancel the trip first'
                        : undefined
                    }
                    onClick={() => setStatus.mutate(option)}
                    className={
                      current
                        ? 'inline-flex h-9 items-center gap-1.5 rounded-full bg-night px-3 text-sm font-medium text-on-night sm:h-8'
                        : 'inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-1 px-3 text-sm font-medium text-ink-soft ring-1 ring-line transition-colors ring-inset hover:bg-surface-2 hover:text-ink disabled:opacity-40 sm:h-8'
                    }
                  >
                    <span className={`size-1.5 rounded-full ${TRUCK_STATUS[option].dot}`} />
                    {TRUCK_STATUS[option].label}
                  </button>
                )
              })}
            </div>
          </Panel>

          <Panel title="Vehicle" bodyClassName="">
            <FactList
              items={[
                { label: 'Make and model', value: [t.make, t.model].filter(Boolean).join(' ') || '—' },
                { label: 'Year', value: t.year ?? '—' },
                { label: 'Body', value: t.body_type ?? '—' },
                { label: 'Fuel', value: t.fuel_type ?? '—' },
                { label: 'Axles', value: t.axles ?? '—' },
                { label: 'Odometer', value: `${fmtNumber(Math.round(t.odometer_km))} km` },
                { label: 'Insurance until', value: fmtDate(t.insurance_expiry) },
                { label: 'Fitness until', value: fmtDate(t.fitness_expiry) },
              ]}
            />
            {t.notes && (
              <p className="border-t border-line px-4 py-3.5 text-sm leading-relaxed text-ink-soft sm:px-5">
                {t.notes}
              </p>
            )}
          </Panel>
        </div>
      </div>

      {editing && <TruckForm open={editing} onClose={() => setEditing(false)} truck={t} />}
    </PageBody>
  )
}
