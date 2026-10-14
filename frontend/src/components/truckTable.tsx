import clsx from 'clsx'
import { Link } from 'react-router-dom'
import type { TruckFilters } from '../lib/api'
import { fmtTons } from '../lib/format'
import { TRUCK_STATUS, TRUCK_STATUS_ORDER } from '../lib/status'
import type { FleetKpis, Truck, TruckStatus } from '../lib/types'
import {
  CapacityBar,
  CellStack,
  EmptyState,
  FilterChip,
  Pill,
  ProgressBar,
  SearchInput,
  Table,
  Td,
  Th,
  Tr,
  TruckStatusBadge,
  selectClass,
} from './ui'

export interface TruckFilterValue {
  statuses: TruckStatus[]
  search: string
  driver: string
  baseCity: string
  minCapacity: string
  quick: 'all' | 'has_space' | 'pending_orders' | 'no_driver'
}

export const EMPTY_TRUCK_FILTER: TruckFilterValue = {
  statuses: [],
  search: '',
  driver: '',
  baseCity: '',
  minCapacity: '',
  quick: 'all',
}

/**
 * Attribute filters only. "Available" and "In transit" are reachable from the
 * status chips, so they are not duplicated here.
 */
const ATTRIBUTE_FILTERS: { key: TruckFilterValue['quick']; label: string }[] = [
  { key: 'has_space', label: 'Has free space' },
  { key: 'pending_orders', label: 'Orders not yet picked up' },
  { key: 'no_driver', label: 'No driver' },
]

/**
 * Translate the filter bar into query parameters.
 *
 * Every one of these is applied in SQL. Narrowing the rows already on screen
 * would search one page and quietly miss the rest -- including the capacity
 * filters, which the server computes with a correlated SUM.
 */
export function truckQuery(filter: TruckFilterValue): TruckFilters {
  return {
    status: filter.statuses.length ? filter.statuses : undefined,
    search: filter.search.trim() || undefined,
    base_city: filter.baseCity || undefined,
    min_capacity: filter.minCapacity ? Number(filter.minCapacity) : undefined,
    has_available_capacity: filter.quick === 'has_space' || undefined,
    with_pending_orders: filter.quick === 'pending_orders' || undefined,
    without_driver: filter.quick === 'no_driver' || undefined,
  }
}

/**
 * The dashboard's fleet figures, shaped for the status chips.
 *
 * The counts have to come from the server: a page holds 25 trucks, so
 * tallying what has been fetched would mislabel every chip.
 */
export function fleetStatusCounts(
  fleet?: FleetKpis,
): Partial<Record<TruckStatus, number>> | undefined {
  if (!fleet) return undefined
  return {
    available: fleet.available,
    assigned: fleet.assigned,
    in_transit: fleet.in_transit,
    at_pickup: fleet.at_pickup,
    at_delivery: fleet.at_delivery,
    delayed: fleet.delayed,
    maintenance: fleet.maintenance,
  }
}

export function TruckFilterBar({
  value,
  onChange,
  statusCounts,
  total,
  driverNames,
  baseCities,
  capacities,
}: {
  value: TruckFilterValue
  onChange: (next: TruckFilterValue) => void
  /** Fleet-wide counts per status, from the dashboard figures. */
  statusCounts?: Partial<Record<TruckStatus, number>>
  total?: number
  driverNames?: string[]
  baseCities?: string[]
  capacities?: number[]
}) {
  const toggleStatus = (status: TruckStatus) => {
    onChange({
      ...value,
      statuses: value.statuses.includes(status)
        ? value.statuses.filter((s) => s !== status)
        : [...value.statuses, status],
    })
  }

  const dirty =
    value.statuses.length > 0 ||
    value.search !== '' ||
    value.driver !== '' ||
    value.baseCity !== '' ||
    value.minCapacity !== '' ||
    value.quick !== 'all'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={value.search}
          onChange={(search) => onChange({ ...value, search })}
          placeholder="Search truck, driver or base"
          className="min-w-56 flex-1"
        />

        {baseCities && baseCities.length > 0 && (
          <select
            value={value.baseCity}
            onChange={(event) => onChange({ ...value, baseCity: event.target.value })}
            className={clsx(selectClass, 'w-auto min-w-32')}
            aria-label="Filter by base"
          >
            <option value="">All bases</option>
            {baseCities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        )}

        {capacities && capacities.length > 0 && (
          <select
            value={value.minCapacity}
            onChange={(event) =>
              onChange({ ...value, minCapacity: event.target.value })
            }
            className={clsx(selectClass, 'w-auto min-w-32')}
            aria-label="Minimum capacity"
          >
            <option value="">Any capacity</option>
            {capacities.map((cap) => (
              <option key={cap} value={cap}>
                {cap}T and above
              </option>
            ))}
          </select>
        )}

        {driverNames && driverNames.length > 0 && (
          <select
            value={value.driver}
            onChange={(event) =>
              onChange({ ...value, driver: event.target.value, search: event.target.value })
            }
            className={clsx(selectClass, 'w-auto min-w-36')}
            aria-label="Filter by driver"
          >
            <option value="">All drivers</option>
            {driverNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip
          active={value.statuses.length === 0 && value.quick === 'all'}
          onClick={() => onChange(EMPTY_TRUCK_FILTER)}
          count={total}
        >
          All
        </FilterChip>

        {TRUCK_STATUS_ORDER.map((status) => {
          const meta = TRUCK_STATUS[status]
          return (
            <FilterChip
              key={status}
              active={value.statuses.includes(status)}
              onClick={() => toggleStatus(status)}
              dot={meta.dot}
              count={statusCounts?.[status]}
            >
              {meta.label}
            </FilterChip>
          )
        })}

        <span className="mx-1 h-5 w-px bg-line" aria-hidden />

        {ATTRIBUTE_FILTERS.map((item) => (
          <FilterChip
            key={item.key}
            active={value.quick === item.key}
            onClick={() =>
              onChange({ ...value, quick: value.quick === item.key ? 'all' : item.key })
            }
          >
            {item.label}
          </FilterChip>
        ))}

        {dirty && (
          <button
            onClick={() => onChange(EMPTY_TRUCK_FILTER)}
            className="ml-auto text-sm font-medium text-brand hover:underline"
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The fleet table. Six columns, at most two lines each: the identity of the
 * truck, who is driving it, how full it is, what it is doing, and how far
 * through its trip it has got. Vehicle specifics and the order manifest live
 * on the truck page, not here.
 */
export function TruckTable({ trucks }: { trucks: Truck[] }) {
  if (!trucks.length) {
    return (
      <EmptyState
        title="No trucks match these filters"
        hint="Reset the filters or widen the capacity range."
      />
    )
  }

  return (
    <Table
      minWidth="62rem"
      head={
        <>
          <Th>Truck</Th>
          <Th>Driver</Th>
          <Th className="w-48">Load</Th>
          <Th>Status</Th>
          <Th align="right">Orders</Th>
          <Th className="w-60">Current trip</Th>
        </>
      }
    >
      {trucks.map((truck) => (
        <Tr key={truck.id} to={`/trucks/${truck.id}`}>
          <Td>
            <Link
              to={`/trucks/${truck.id}`}
              className="font-mono text-sm font-semibold text-ink hover:text-brand"
            >
              {truck.registration_number}
            </Link>
            {truck.base_city && (
              <div className="text-xs text-ink-dim">{truck.base_city}</div>
            )}
          </Td>

          <Td>
            {truck.driver ? (
              <CellStack
                primary={
                  <Link to={`/drivers/${truck.driver.id}`} className="hover:text-brand">
                    {truck.driver.name}
                  </Link>
                }
                secondary={
                  <a
                    href={`tel:${truck.driver.phone.replace(/\s/g, '')}`}
                    className="hover:text-brand"
                  >
                    {truck.driver.phone}
                  </a>
                }
              />
            ) : (
              <span className="text-sm font-medium text-st-delayed">Not assigned</span>
            )}
          </Td>

          <Td>
            <CapacityBar capacity={truck.capacity} size="sm" />
          </Td>

          <Td>
            <TruckStatusBadge status={truck.status} size="sm" />
          </Td>

          <Td align="right">
            {truck.capacity.order_count > 0 ? (
              <Pill>
                {truck.capacity.order_count} · {fmtTons(truck.capacity.current_load_tons)}
              </Pill>
            ) : (
              <span className="text-sm text-ink-dim">—</span>
            )}
          </Td>

          <Td>
            {truck.current_trip_id ? (
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    to={`/trips/${truck.current_trip_id}`}
                    className="font-mono text-sm font-medium text-brand hover:underline"
                  >
                    {truck.current_trip_code}
                  </Link>
                  <span className="shrink-0 text-xs tabular-nums text-ink-dim">
                    {Math.round(truck.trip_progress_percent ?? 0)}%
                  </span>
                </div>
                <ProgressBar percent={truck.trip_progress_percent ?? 0} />
                <div className="truncate text-xs text-ink-dim">
                  {truck.next_stop ? (
                    <>
                      <span
                        className={clsx(
                          'font-medium',
                          truck.next_stop_type === 'pickup'
                            ? 'text-st-pickup'
                            : 'text-st-delivery',
                        )}
                      >
                        {truck.next_stop_type === 'pickup' ? 'Pick up' : 'Deliver'}
                      </span>
                      {' · '}
                      {truck.next_stop}
                    </>
                  ) : (
                    'Awaiting dispatch'
                  )}
                </div>
              </div>
            ) : (
              <span className="text-sm text-ink-dim">—</span>
            )}
          </Td>
        </Tr>
      ))}
    </Table>
  )
}
