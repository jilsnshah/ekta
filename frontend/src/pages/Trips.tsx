import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtDateTime, fmtTons } from '../lib/format'
import { TRIP_STATUS, TRIP_STATUS_ORDER } from '../lib/status'
import type { TripStatus } from '../lib/types'
import { MetaItem, PageHeader } from '../components/shell'
import {
  CellStack,
  EmptyState,
  FilterChip,
  LinkButton,
  Pagination,
  Panel,
  ProgressBar,
  SearchInput,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
  TripStatusBadge,
} from '../components/ui'

export default function Trips() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')

  const status = params.get('status') as TripStatus | null

  const list = usePaged({
    key: ['trips'],
    filters: {
      status: status ? [status] : undefined,
      search: search.trim() || undefined,
    },
    fetchPage: (params) => api.trips(params),
    refetchInterval: 45_000,
  })

  // Chip counts and cargo on the road come from the server, over every trip
  // rather than the 25 on screen.
  const stats = useQuery({
    queryKey: ['trips', 'stats', search.trim()],
    queryFn: () => api.tripStats({ search: search.trim() || undefined }),
    refetchInterval: 45_000,
  })

  const counts = stats.data?.by_status ?? {}
  const rows = list.items

  const setStatus = (next: TripStatus | null) => {
    const search = new URLSearchParams(params)
    if (next) search.set('status', next)
    else search.delete('status')
    setParams(search, { replace: true })
  }

  const activeCargo = stats.data?.active_cargo_tons ?? 0

  return (
    <div className="p-6">
      <PageHeader
        title="Trips"
        subtitle="Each truck's run: the orders it carries and the stops it must make."
        meta={
          <>
            <MetaItem label="Showing">
              {list.page.total.toLocaleString()} trips
            </MetaItem>
            <MetaItem label="Cargo in progress">{fmtTons(activeCargo)}</MetaItem>
          </>
        }
        actions={
          <LinkButton to="/assign" variant="primary">
            Create a trip
          </LinkButton>
        }
      />

      <Panel bodyClassName="overflow-visible">
        <div className="space-y-3 border-b border-line p-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search trip, truck or driver"
            className="max-w-md"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={!status} onClick={() => setStatus(null)}>
              All
            </FilterChip>
            {TRIP_STATUS_ORDER.map((option) => {
              const meta = TRIP_STATUS[option]
              return (
                <FilterChip
                  key={option}
                  active={status === option}
                  onClick={() => setStatus(status === option ? null : option)}
                  dot={meta.dot}
                  count={counts[option]}
                >
                  {meta.label}
                </FilterChip>
              )
            })}
          </div>
        </div>

        {list.isInitialLoading ? (
          <Spinner label="Loading trips" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No trips match"
            hint="Assign orders to a truck to open a trip."
          />
        ) : (
          <>
          <Table
            minWidth="60rem"
            head={
              <>
                <Th>Trip</Th>
                <Th>Truck and driver</Th>
                <Th>Status</Th>
                <Th align="right">Cargo</Th>
                <Th align="right">Orders</Th>
                <Th className="w-56">Stops completed</Th>
                <Th align="right">Started</Th>
              </>
            }
          >
            {rows.map((trip) => (
              <Tr key={trip.id} to={`/trips/${trip.id}`}>
                <Td>
                  <Link
                    to={`/trips/${trip.id}`}
                    className="font-mono text-sm font-semibold text-ink hover:text-brand"
                  >
                    {trip.code}
                  </Link>
                </Td>

                <Td>
                  <CellStack
                    primary={
                      <Link
                        to={`/trucks/${trip.truck_id}`}
                        className="font-mono hover:text-brand"
                      >
                        {trip.truck_registration}
                      </Link>
                    }
                    secondary={trip.driver_name ?? 'No driver'}
                  />
                </Td>

                <Td>
                  <TripStatusBadge status={trip.status} size="sm" />
                </Td>

                <Td align="right" className="font-medium tabular-nums">
                  {fmtTons(trip.total_cargo_tons)}
                  {trip.truck_capacity_tons && (
                    <div className="text-xs font-normal text-ink-dim">
                      of {fmtTons(trip.truck_capacity_tons)}
                    </div>
                  )}
                </Td>

                <Td align="right" className="tabular-nums">
                  {trip.order_count}
                </Td>

                <Td>
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-sm font-medium tabular-nums text-ink">
                      {trip.stops_completed}/{trip.stop_count}
                    </span>
                    <ProgressBar
                      percent={trip.progress_percent}
                      tone={trip.status === 'completed' ? 'success' : 'brand'}
                    />
                  </div>
                </Td>

                <Td align="right" className="text-ink-soft">
                  {trip.started_at ? (
                    fmtDateTime(trip.started_at)
                  ) : (
                    <span className="text-ink-dim">Not started</span>
                  )}
                  {trip.completed_at && (
                    <div className="text-xs text-ink-dim">
                      Done {fmtDateTime(trip.completed_at)}
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
          <Pagination
            page={list.page}
            onPage={list.setPage}
            pageSize={list.pageSize}
            onPageSize={list.setPageSize}
            noun="trips"
            busy={list.isPlaceholderData}
          />
          </>
        )}
      </Panel>
    </div>
  )
}
