import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtDate, fmtDateTime, fmtTons } from '../lib/format'
import { MetaItem, PageHeader } from '../components/shell'
import {
  Callout,
  DriverStatusBadge,
  EmptyState,
  LinkButton,
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
} from '../components/ui'

export default function DriverDetail() {
  const { id } = useParams()
  const driverId = Number(id)

  const driver = useQuery({
    queryKey: ['driver', driverId],
    queryFn: () => api.driver(driverId),
    enabled: Number.isFinite(driverId),
    refetchInterval: 45_000,
  })

  // Paged for the same reason as the truck's: a long-serving driver has
  // hundreds of trips behind them.
  const trips = usePaged({
    key: ['driver-trips', driverId],
    filters: {},
    fetchPage: (params) => api.driverTrips(driverId, params),
    pageSize: 10,
  })

  if (driver.isLoading) return <Spinner label="Loading driver" />
  if (!driver.data) return <EmptyState title="Driver not found" />

  const d = driver.data
  const licenceExpired = d.license_expiry
    ? new Date(`${d.license_expiry}Z`) < new Date()
    : false

  return (
    <div className="p-6">
      <PageHeader
        back={{ to: '/drivers', label: 'All drivers' }}
        title={
          <>
            {d.name}
            <DriverStatusBadge status={d.status} />
          </>
        }
        meta={
          <>
            <MetaItem label="Phone">
              <a
                href={`tel:${d.phone.replace(/\s/g, '')}`}
                className="text-brand hover:underline"
              >
                {d.phone}
              </a>
            </MetaItem>
            <MetaItem label="Driver ID">{d.code}</MetaItem>
            <MetaItem label="Trips completed">{d.completed_trips}</MetaItem>
          </>
        }
        actions={
          d.current_trip_id ? (
            <LinkButton to={`/trips/${d.current_trip_id}`} variant="primary">
              Open {d.current_trip_code}
            </LinkButton>
          ) : d.truck_id ? (
            <LinkButton to={`/trucks/${d.truck_id}`}>
              View {d.truck_registration}
            </LinkButton>
          ) : null
        }
      />

      {licenceExpired && (
        <div className="mb-4">
          <Callout tone="danger">
            Licence expired on {fmtDate(d.license_expiry)}. This driver should not be dispatched.
          </Callout>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-4">
          <Panel title="Driver record">
            <div className="grid grid-cols-2 gap-4 p-5">
              <Stat label="Driver ID" value={d.code} mono />
              <Stat label="Phone" value={d.phone} mono />
              <Stat label="Licence" value={d.license_number} mono />
              <Stat label="Licence expiry" value={fmtDate(d.license_expiry)} />
              <Stat label="Home city" value={d.home_city ?? '—'} />
            </div>
          </Panel>

          <Panel title="Assignment">
            <div className="space-y-4 p-5">
              <Stat
                label="Truck"
                value={
                  d.truck_id ? (
                    <Link
                      to={`/trucks/${d.truck_id}`}
                      className="font-mono font-medium text-brand hover:underline"
                    >
                      {d.truck_registration}
                    </Link>
                  ) : (
                    <span className="text-ink-dim">Not assigned</span>
                  )
                }
              />
              <Stat
                label="Current trip"
                value={
                  d.current_trip_id ? (
                    <Link
                      to={`/trips/${d.current_trip_id}`}
                      className="font-mono font-medium text-brand hover:underline"
                    >
                      {d.current_trip_code}
                    </Link>
                  ) : (
                    <span className="text-ink-dim">—</span>
                  )
                }
              />
            </div>
          </Panel>
        </div>

        <Panel
          title="Trip history"
          description={`${trips.page.total.toLocaleString()} trips`}
        >
          {trips.isInitialLoading ? (
            <Spinner />
          ) : trips.items.length === 0 ? (
            <EmptyState
              title="No trips recorded"
              hint="This driver has not been dispatched yet."
            />
          ) : (
            <Table
              minWidth="48rem"
              head={
                <>
                  <Th>Trip</Th>
                  <Th>Truck</Th>
                  <Th>Status</Th>
                  <Th align="right">Cargo</Th>
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
                    <Link
                      to={`/trucks/${trip.truck_id}`}
                      className="font-mono text-sm hover:text-brand"
                    >
                      {trip.truck_registration}
                    </Link>
                  </Td>
                  <Td>
                    <TripStatusBadge status={trip.status} size="sm" />
                  </Td>
                  <Td align="right" className="font-medium tabular-nums">
                    {fmtTons(trip.total_cargo_tons)}
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
    </div>
  )
}
