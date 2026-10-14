import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { usePaged } from '../../lib/usePaged'
import { fmtDateTime, fmtTons } from '../../lib/format'
import { DriverPageTitle } from '../../components/driverShell'
import {
  EmptyState,
  Pagination,
  Panel,
  Spinner,
  TripStatusBadge,
} from '../../components/ui'

export default function DriverHistory() {
  // Paged, because a driver's record keeps growing and a phone should not
  // pull years of trips to show the last few.
  const trips = usePaged({
    key: ['driver-history'],
    filters: {},
    fetchPage: (params) => api.driverApp.history(params),
    pageSize: 15,
  })

  // The headline is their whole record, from the server -- not a tally of the
  // page on screen.
  const stats = useQuery({
    queryKey: ['driver-history', 'stats'],
    queryFn: () => api.driverApp.historyStats(),
  })

  const list = trips.items

  return (
    <>
      <DriverPageTitle
        title="Past trips"
        subtitle={
          stats.data?.completed
            ? `${stats.data.completed} completed · ${fmtTons(
                stats.data.completed_cargo_tons,
              )} carried in total`
            : undefined
        }
      />

      {trips.isInitialLoading ? (
        <Spinner label="Loading your trips" />
      ) : list.length === 0 ? (
        <Panel>
          <EmptyState
            title="No trips yet"
            hint="Trips you run will be listed here once they are done."
          />
        </Panel>
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {list.map((trip) => (
              <li key={trip.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-ink">
                      {trip.code}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {fmtTons(trip.total_cargo_tons)} · {trip.stops_completed} of{' '}
                      {trip.stop_count} stops
                    </p>
                  </div>
                  <TripStatusBadge status={trip.status} size="sm" />
                </div>
                <p className="mt-1.5 text-xs text-ink-dim">
                  {trip.completed_at
                    ? `Finished ${fmtDateTime(trip.completed_at)}`
                    : trip.started_at
                      ? `Started ${fmtDateTime(trip.started_at)}`
                      : 'Not started'}
                </p>
              </li>
            ))}
          </ul>
          <Pagination
            page={trips.page}
            onPage={trips.setPage}
            pageSize={trips.pageSize}
            onPageSize={trips.setPageSize}
            noun="trips"
            busy={trips.isPlaceholderData}
          />
        </Panel>
      )}
    </>
  )
}
