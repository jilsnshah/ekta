import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtDate, fmtDateTime, fmtDayRelative, fmtNumber, fmtTons, titleCase } from '../lib/format'
import { OPERATOR_SETTABLE_STATUSES, TRUCK_STATUS } from '../lib/status'
import { MetaItem, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Button,
  Callout,
  CapacityBar,
  EmptyState,
  LinkButton,
  OrderStatusBadge,
  Pagination,
  Panel,
  ProgressBar,
  Spinner,
  Stat,
  Table,
  Td,
  Th,
  Tr,
  TripStatusBadge,
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

  if (truck.isLoading) return <Spinner label="Loading truck" />
  if (!truck.data) return <EmptyState title="Truck not found" />

  const t = truck.data
  const onTrip = Boolean(t.current_trip_id)

  return (
    <div className="p-6">
      <PageHeader
        back={{ to: '/trucks', label: 'All trucks' }}
        title={
          <>
            <span className="font-mono">{t.registration_number}</span>
            <TruckStatusBadge status={t.status} />
          </>
        }
        meta={
          <>
            <MetaItem label="Capacity">{fmtTons(t.capacity_tons)}</MetaItem>
            <MetaItem label="On board">
              {fmtTons(t.capacity.current_load_tons)} · {t.capacity.order_count} orders
            </MetaItem>
            {t.base_city && <MetaItem label="Base">{t.base_city}</MetaItem>}
            {t.driver && (
              <MetaItem label="Driver">
                <Link to={`/drivers/${t.driver.id}`} className="text-brand hover:underline">
                  {t.driver.name}
                </Link>
              </MetaItem>
            )}
          </>
        }
        actions={
          <>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            {onTrip && (
              <LinkButton to={`/trips/${t.current_trip_id}`} variant="primary">
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

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Panel
            title="Load on board"
            description={`${fmtTons(t.capacity.available_tons)} of free capacity`}
          >
            <div className="border-b border-line p-5">
              <CapacityBar capacity={t.capacity} />
            </div>
            {t.orders.length === 0 ? (
              <EmptyState
                title="Nothing on board"
                hint="This truck is empty and ready to load."
                action={
                  <LinkButton to="/assign" variant="primary" size="sm">
                    Assign orders
                  </LinkButton>
                }
              />
            ) : (
              <Table
                minWidth="46rem"
                head={
                  <>
                    <Th>Order</Th>
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
                    <Td align="right" className="font-medium tabular-nums">
                      {fmtTons(order.quantity_tons)}
                    </Td>
                    <Td className="text-ink-soft">{order.pickup_name}</Td>
                    <Td className="text-ink-soft">{order.drop_name}</Td>
                    <Td align="right">{fmtDayRelative(order.pickup_date)}</Td>
                    <Td>
                      <OrderStatusBadge status={order.status} size="sm" />
                    </Td>
                  </Tr>
                ))}
              </Table>
            )}
          </Panel>

          <Panel
            title="Trip history"
            description={`${trips.page.total.toLocaleString()} trips`}
          >
            {trips.isInitialLoading ? (
              <Spinner />
            ) : trips.items.length === 0 ? (
              <EmptyState
                title="No trips yet"
                hint="Assign orders to this truck to create its first trip."
              />
            ) : (
              <Table
                minWidth="48rem"
                head={
                  <>
                    <Th>Trip</Th>
                    <Th>Status</Th>
                    <Th align="right">Cargo</Th>
                    <Th align="right">Orders</Th>
                    <Th className="w-44">Stops</Th>
                    <Th align="right">Started</Th>
                  </>
                }
              >
                {trips.items.map((trip) => (
                  <Tr key={trip.id} to={`/trips/${trip.id}`}>
                    <Td>
                      <Link
                        to={`/trips/${trip.id}`}
                        className="font-mono text-sm font-medium text-ink hover:text-brand"
                      >
                        {trip.code}
                      </Link>
                    </Td>
                    <Td>
                      <TripStatusBadge status={trip.status} size="sm" />
                    </Td>
                    <Td align="right" className="font-medium tabular-nums">
                      {fmtTons(trip.total_cargo_tons)}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {trip.order_count}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <span className="shrink-0 text-sm tabular-nums">
                          {trip.stops_completed}/{trip.stop_count}
                        </span>
                        <ProgressBar
                          percent={trip.progress_percent}
                          tone={trip.status === 'completed' ? 'success' : 'brand'}
                        />
                      </div>
                    </Td>
                    <Td align="right" className="text-ink-soft">
                      {trip.started_at ? fmtDateTime(trip.started_at) : '—'}
                    </Td>
                  </Tr>
                ))}
              </Table>
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
            <Panel title="Current trip">
              <div className="space-y-4 p-5">
                <Stat
                  label="Trip"
                  value={
                    <Link
                      to={`/trips/${t.current_trip_id}`}
                      className="font-mono font-medium text-brand hover:underline"
                    >
                      {t.current_trip_code}
                    </Link>
                  }
                />
                <Stat
                  label="Next stop"
                  value={
                    t.next_stop ? (
                      <>
                        {t.next_stop}
                        <span className="text-ink-dim">
                          {' '}
                          · {t.next_stop_type === 'pickup' ? 'pick up' : 'deliver'}
                        </span>
                      </>
                    ) : (
                      'Awaiting dispatch'
                    )
                  }
                />
                <Stat
                  label="Stops remaining"
                  value={t.stops_remaining != null ? String(t.stops_remaining) : '—'}
                  mono
                />
                <div>
                  <ProgressBar
                    percent={t.trip_progress_percent ?? 0}
                    label="Trip progress"
                  />
                </div>
              </div>
            </Panel>
          )}

          <Panel title="Driver">
            {t.driver ? (
              <div className="space-y-4 p-5">
                <Stat
                  label="Name"
                  value={
                    <Link
                      to={`/drivers/${t.driver.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {t.driver.name}
                    </Link>
                  }
                />
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
                <Stat label="Licence" value={t.driver.license_number} mono />
              </div>
            ) : (
              <div className="p-5">
                <Button size="sm" onClick={() => setEditing(true)}>
                  Assign a driver
                </Button>
              </div>
            )}
          </Panel>

          <Panel
            title="Status"
            description="Assigned and in transit follow the trip automatically."
          >
            <div className="flex flex-wrap gap-2 p-5">
              {OPERATOR_SETTABLE_STATUSES.map((option) => {
                const disabled =
                  setStatus.isPending ||
                  t.status === option ||
                  (option === 'available' && onTrip)
                return (
                  <Button
                    key={option}
                    size="sm"
                    variant={t.status === option ? 'primary' : 'secondary'}
                    disabled={disabled}
                    title={
                      option === 'available' && onTrip
                        ? 'Complete or cancel the trip first'
                        : undefined
                    }
                    onClick={() => setStatus.mutate(option)}
                  >
                    {TRUCK_STATUS[option].label}
                  </Button>
                )
              })}
            </div>
          </Panel>

          <Panel title="Vehicle">
            <div className="grid grid-cols-2 gap-4 p-5">
              <Stat label="Make" value={t.make ?? '—'} />
              <Stat label="Model" value={t.model ?? '—'} />
              <Stat label="Year" value={t.year ?? '—'} mono />
              <Stat label="Axles" value={t.axles ?? '—'} mono />
              <Stat label="Body" value={t.body_type ?? '—'} />
              <Stat label="Fuel" value={t.fuel_type ?? '—'} />
              <Stat label="Odometer" value={`${fmtNumber(Math.round(t.odometer_km))} km`} mono />
              <Stat label="Insurance" value={fmtDate(t.insurance_expiry)} />
              <Stat label="Fitness" value={fmtDate(t.fitness_expiry)} />
            </div>
            {t.notes && (
              <p className="border-t border-line px-5 py-4 text-sm text-ink-soft">{t.notes}</p>
            )}
          </Panel>
        </div>
      </div>

      {editing && <TruckForm open={editing} onClose={() => setEditing(false)} truck={t} />}
    </div>
  )
}
