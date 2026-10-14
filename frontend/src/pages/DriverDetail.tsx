import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtDate } from '../lib/format'
import { IconDriver, IconPhone, IconTrips, IconTruck } from '../components/icons'
import { PageBody, PageHeader } from '../components/shell'
import { TripHistoryList } from '../components/tripList'
import {
  Avatar,
  Callout,
  Code,
  DriverStatusBadge,
  EmptyState,
  FactList,
  LinkButton,
  Pagination,
  Panel,
  Spinner,
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

  if (driver.isLoading)
    return (
      <PageBody>
        <Spinner label="Loading driver" />
      </PageBody>
    )
  if (!driver.data)
    return (
      <PageBody>
        <EmptyState icon={<IconDriver size={20} />} title="Driver not found" />
      </PageBody>
    )

  const d = driver.data
  const licenceExpired = d.license_expiry
    ? new Date(`${d.license_expiry}Z`) < new Date()
    : false

  return (
    <PageBody>
      <PageHeader
        back={{ to: '/drivers', label: 'Drivers' }}
        eyebrow="Driver"
        title={
          <>
            <Avatar name={d.name} size={40} tone="brand" />
            {d.name}
            <DriverStatusBadge status={d.status} />
          </>
        }
        subtitle={
          <>
            <span className="font-mono">{d.code}</span>
            {d.home_city && <> · {d.home_city}</>} · {d.completed_trips}{' '}
            {d.completed_trips === 1 ? 'trip' : 'trips'} completed
          </>
        }
        actions={
          <>
            <a
              href={`tel:${d.phone.replace(/\s/g, '')}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface-1 px-4 font-mono text-sm text-ink shadow-button transition-colors hover:border-line-strong sm:h-9 sm:px-3.5"
            >
              <IconPhone size={16} className="text-st-available" />
              {d.phone}
            </a>
            {d.current_trip_id ? (
              <LinkButton to={`/trips/${d.current_trip_id}`} variant="primary">
                <IconTrips size={16} />
                Open {d.current_trip_code}
              </LinkButton>
            ) : d.truck_id ? (
              <LinkButton to={`/trucks/${d.truck_id}`}>
                <IconTruck size={16} />
                View {d.truck_registration}
              </LinkButton>
            ) : null}
          </>
        }
      />

      {licenceExpired && (
        <div className="mb-4">
          <Callout tone="danger">
            Licence expired on {fmtDate(d.license_expiry)}. This driver should not be dispatched.
          </Callout>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Assignment" bodyClassName="">
            <FactList
              items={[
                {
                  label: 'Truck',
                  value: d.truck_id ? (
                    <Code to={`/trucks/${d.truck_id}`} className="text-brand">
                      {d.truck_registration}
                    </Code>
                  ) : (
                    <span className="font-normal text-ink-dim">Not assigned</span>
                  ),
                },
                {
                  label: 'Current trip',
                  value: d.current_trip_id ? (
                    <Code to={`/trips/${d.current_trip_id}`} className="text-brand">
                      {d.current_trip_code}
                    </Code>
                  ) : (
                    <span className="font-normal text-ink-dim">None</span>
                  ),
                },
              ]}
            />
          </Panel>

          <Panel title="Driver record" bodyClassName="">
            <FactList
              items={[
                { label: 'Driver ID', value: d.code, mono: true },
                { label: 'Phone', value: d.phone, mono: true },
                { label: 'Licence', value: d.license_number, mono: true },
                {
                  label: 'Licence expires',
                  value: (
                    <span className={licenceExpired ? 'text-st-delayed' : undefined}>
                      {fmtDate(d.license_expiry)}
                    </span>
                  ),
                },
                { label: 'Home city', value: d.home_city ?? '—' },
              ]}
            />
          </Panel>
        </div>

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
              title="No trips recorded"
              hint="This driver has not been dispatched yet."
            />
          ) : (
            <TripHistoryList trips={trips.items} show="truck" />
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
    </PageBody>
  )
}
