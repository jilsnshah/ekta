import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtDateTime, fmtTons } from '../lib/format'
import { TRIP_STATUS, TRIP_STATUS_ORDER } from '../lib/status'
import type { TripBrief, TripStatus } from '../lib/types'
import { IconAssign, IconTrips } from '../components/icons'
import { MetaItem, PageBody, PageHeader } from '../components/shell'
import {
  ChipBar,
  Code,
  EmptyState,
  FilterChip,
  LinkButton,
  ListCard,
  Pagination,
  Panel,
  ProgressBar,
  ResponsiveList,
  SearchInput,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
  TripStatusBadge,
} from '../components/ui'

/** "2 of 4 stops" with a bar, the one thing everyone asks about a trip. */
function StopProgress({ trip }: { trip: TripBrief }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-sm font-medium tabular-nums text-ink">
        {trip.stops_completed}
        <span className="font-normal text-ink-dim">/{trip.stop_count}</span>
      </span>
      <ProgressBar
        percent={trip.progress_percent}
        tone={trip.status === 'completed' ? 'success' : 'brand'}
      />
    </div>
  )
}

function When({ trip }: { trip: TripBrief }) {
  if (trip.completed_at) return <>Finished {fmtDateTime(trip.completed_at)}</>
  if (trip.started_at) return <>Started {fmtDateTime(trip.started_at)}</>
  return <span className="text-ink-dim">Not started</span>
}

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
    <PageBody>
      <PageHeader
        title="Trips"
        subtitle="Each truck's run: the orders it carries and the stops it must make."
        meta={
          <>
            <MetaItem label="Matching">{list.page.total.toLocaleString('en-IN')}</MetaItem>
            <MetaItem label="On the road">{fmtTons(activeCargo)}</MetaItem>
          </>
        }
        actions={
          <LinkButton to="/assign" variant="primary">
            <IconAssign size={16} />
            Plan a trip
          </LinkButton>
        }
      />

      <Panel bodyClassName="overflow-visible">
        <div className="space-y-3 border-b border-line p-4 sm:px-5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search trip, truck or driver"
            className="lg:max-w-md"
          />
          <ChipBar>
            <FilterChip active={!status} onClick={() => setStatus(null)} count={stats.data?.total}>
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
          </ChipBar>
        </div>

        {list.isInitialLoading ? (
          <Spinner label="Loading trips" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<IconTrips size={20} />}
            title="No trips match"
            hint="Assign orders to a truck to open a trip."
          />
        ) : (
          <>
            <ResponsiveList
      breakpoint="xl"
              cards={
                <ul className="divide-y divide-line">
                  {rows.map((trip) => (
                    <ListCard key={trip.id} to={`/trips/${trip.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Code to={`/trips/${trip.id}`} className="font-semibold">
                            {trip.code}
                          </Code>
                          <p className="mt-0.5 truncate text-sm text-ink-soft">
                            <span className="font-mono text-xs text-ink">
                              {trip.truck_registration}
                            </span>
                            {' · '}
                            {trip.driver_name ?? 'No driver'}
                          </p>
                        </div>
                        <TripStatusBadge status={trip.status} size="sm" />
                      </div>
                      <div className="mt-3">
                        <StopProgress trip={trip} />
                      </div>
                      <p className="mt-2 text-xs text-ink-dim">
                        {fmtTons(trip.total_cargo_tons)} · {trip.order_count}{' '}
                        {trip.order_count === 1 ? 'order' : 'orders'} · <When trip={trip} />
                      </p>
                    </ListCard>
                  ))}
                </ul>
              }
              table={
                <Table
                  minWidth="58rem"
                  head={
                    <>
                      <Th>Trip</Th>
                      <Th>Truck and driver</Th>
                      <Th>Status</Th>
                      <Th align="right">Cargo</Th>
                      <Th className="w-56">Stops</Th>
                      <Th>When</Th>
                    </>
                  }
                >
                  {rows.map((trip) => (
                    <Tr key={trip.id} to={`/trips/${trip.id}`}>
                      <Td>
                        <Code to={`/trips/${trip.id}`} className="font-semibold">
                          {trip.code}
                        </Code>
                        <div className="mt-0.5 text-xs text-ink-dim">
                          {trip.order_count} {trip.order_count === 1 ? 'order' : 'orders'}
                        </div>
                      </Td>

                      <Td>
                        <Link
                          to={`/trucks/${trip.truck_id}`}
                          className="font-mono text-[0.8125rem] font-medium text-ink hover:text-brand"
                        >
                          {trip.truck_registration}
                        </Link>
                        <div className="mt-0.5 truncate text-xs text-ink-dim">
                          {trip.driver_name ?? 'No driver'}
                        </div>
                      </Td>

                      <Td>
                        <TripStatusBadge status={trip.status} size="sm" />
                      </Td>

                      <Td align="right" className="font-semibold tabular-nums">
                        {fmtTons(trip.total_cargo_tons)}
                        {trip.truck_capacity_tons && (
                          <div className="text-xs font-normal text-ink-dim">
                            of {fmtTons(trip.truck_capacity_tons)}
                          </div>
                        )}
                      </Td>

                      <Td>
                        <StopProgress trip={trip} />
                      </Td>

                      <Td className="text-sm whitespace-nowrap text-ink-soft">
                        <When trip={trip} />
                      </Td>
                    </Tr>
                  ))}
                </Table>
              }
            />
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
    </PageBody>
  )
}
