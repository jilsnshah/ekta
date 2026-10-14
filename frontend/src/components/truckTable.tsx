import clsx from 'clsx'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { TruckFilters } from '../lib/api'
import { TRUCK_STATUS, TRUCK_STATUS_ORDER } from '../lib/status'
import type { FleetKpis, Truck, TruckStatus } from '../lib/types'
import { IconSliders, IconTruck } from './icons'
import {
  CapacityBar,
  ChipBar,
  ChipDivider,
  Code,
  EmptyState,
  FilterChip,
  ListCard,
  ProgressBar,
  ResponsiveList,
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
  // On a phone the secondary selects fold away behind one button, so the
  // search box and the status row are what the screen opens on.
  const [moreOpen, setMoreOpen] = useState(false)

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

  const hasSelects =
    (baseCities?.length ?? 0) > 0 ||
    (capacities?.length ?? 0) > 0 ||
    (driverNames?.length ?? 0) > 0
  const selectsActive = value.baseCity !== '' || value.minCapacity !== '' || value.driver !== ''

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <SearchInput
          value={value.search}
          onChange={(search) => onChange({ ...value, search })}
          placeholder="Search truck, driver or base"
          className="min-w-0 flex-1 lg:max-w-sm"
        />
        {hasSelects && (
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-label="More filters"
            className={clsx(
              'relative grid size-11 shrink-0 place-items-center rounded-lg border shadow-button transition-colors md:hidden',
              moreOpen || selectsActive
                ? 'border-brand/40 bg-brand-tint text-brand'
                : 'border-line bg-surface-1 text-ink-soft',
            )}
          >
            <IconSliders size={18} />
            {selectsActive && (
              <span className="absolute top-2 right-2 size-2 rounded-full bg-brand ring-2 ring-surface-1" />
            )}
          </button>
        )}
        {hasSelects && (
          <div className="hidden gap-2 md:flex">
            <Selects
              value={value}
              onChange={onChange}
              baseCities={baseCities}
              capacities={capacities}
              driverNames={driverNames}
            />
          </div>
        )}
        {dirty && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_TRUCK_FILTER)}
            className="ml-auto hidden h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-brand hover:bg-brand-tint md:block"
          >
            Reset
          </button>
        )}
      </div>

      {hasSelects && moreOpen && (
        <div className="grid animate-fade-up grid-cols-2 gap-2 md:hidden">
          <Selects
            value={value}
            onChange={onChange}
            baseCities={baseCities}
            capacities={capacities}
            driverNames={driverNames}
          />
        </div>
      )}

      <ChipBar>
        <FilterChip
          active={value.statuses.length === 0 && value.quick === 'all'}
          onClick={() => onChange({ ...value, statuses: [], quick: 'all' })}
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

        <ChipDivider />

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
          <FilterChip
            active={false}
            onClick={() => onChange(EMPTY_TRUCK_FILTER)}
            className="text-brand md:hidden"
          >
            Reset
          </FilterChip>
        )}
      </ChipBar>
    </div>
  )
}

function Selects({
  value,
  onChange,
  baseCities,
  capacities,
  driverNames,
}: {
  value: TruckFilterValue
  onChange: (next: TruckFilterValue) => void
  baseCities?: string[]
  capacities?: number[]
  driverNames?: string[]
}) {
  return (
    <>
      {baseCities && baseCities.length > 0 && (
        <select
          value={value.baseCity}
          onChange={(event) => onChange({ ...value, baseCity: event.target.value })}
          className={clsx(selectClass, 'md:w-40')}
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
          onChange={(event) => onChange({ ...value, minCapacity: event.target.value })}
          className={clsx(selectClass, 'md:w-40')}
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
          className={clsx(selectClass, 'md:w-44')}
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
    </>
  )
}

/** "Pick up · Rajkot Warehouse", coloured by the leg. */
function NextStop({ truck }: { truck: Truck }) {
  if (!truck.next_stop) return <span className="text-ink-dim">Awaiting dispatch</span>
  return (
    <>
      <span
        className={clsx(
          'font-medium',
          truck.next_stop_type === 'pickup' ? 'text-st-pickup' : 'text-st-delivery',
        )}
      >
        {truck.next_stop_type === 'pickup' ? 'Pick up' : 'Deliver'}
      </span>
      <span className="text-ink-dim"> · </span>
      <span className="text-ink-soft">{truck.next_stop}</span>
    </>
  )
}

/**
 * The fleet list. On a desk, six columns at most two lines each: the truck,
 * who drives it, how full it is, what it is doing, and where its trip has got
 * to. On a phone, one card per truck with the same facts stacked.
 */
export function TruckTable({ trucks }: { trucks: Truck[] }) {
  if (!trucks.length) {
    return (
      <EmptyState
        icon={<IconTruck size={20} />}
        title="No trucks match these filters"
        hint="Reset the filters or widen the capacity range."
      />
    )
  }

  return (
    <ResponsiveList
      breakpoint="xl"
      cards={
        <ul className="divide-y divide-line">
          {trucks.map((truck) => (
            <ListCard key={truck.id} to={`/trucks/${truck.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Code to={`/trucks/${truck.id}`} className="text-sm font-semibold">
                    {truck.registration_number}
                  </Code>
                  <p className="mt-0.5 truncate text-sm text-ink-soft">
                    {truck.driver ? (
                      truck.driver.name
                    ) : (
                      <span className="font-medium text-st-delayed">No driver</span>
                    )}
                    {truck.base_city && (
                      <span className="text-ink-dim"> · {truck.base_city}</span>
                    )}
                  </p>
                </div>
                <TruckStatusBadge status={truck.status} size="sm" />
              </div>
              <div className="mt-3">
                <CapacityBar capacity={truck.capacity} size="sm" />
              </div>
              {truck.current_trip_id && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <Code to={`/trips/${truck.current_trip_id}`} className="text-xs text-brand">
                    {truck.current_trip_code}
                  </Code>
                  <span className="min-w-0 truncate">
                    <NextStop truck={truck} />
                  </span>
                </div>
              )}
            </ListCard>
          ))}
        </ul>
      }
      table={
        <Table
          minWidth="54rem"
          head={
            <>
              <Th>Truck</Th>
              <Th>Driver</Th>
              <Th className="w-52">Load</Th>
              <Th>Status</Th>
              <Th className="w-64">Current trip</Th>
            </>
          }
        >
          {trucks.map((truck) => (
            <Tr key={truck.id} to={`/trucks/${truck.id}`}>
              <Td>
                <Code to={`/trucks/${truck.id}`} className="font-semibold">
                  {truck.registration_number}
                </Code>
                {truck.base_city && (
                  <div className="mt-0.5 text-xs text-ink-dim">{truck.base_city}</div>
                )}
              </Td>

              <Td>
                {truck.driver ? (
                  <div className="min-w-0">
                    <Link
                      to={`/drivers/${truck.driver.id}`}
                      className="block truncate font-medium text-ink hover:text-brand"
                    >
                      {truck.driver.name}
                    </Link>
                    <a
                      href={`tel:${truck.driver.phone.replace(/\s/g, '')}`}
                      className="mt-0.5 block truncate font-mono text-xs text-ink-dim hover:text-brand"
                    >
                      {truck.driver.phone}
                    </a>
                  </div>
                ) : (
                  <span className="text-sm font-medium text-st-delayed">No driver</span>
                )}
              </Td>

              <Td>
                <CapacityBar capacity={truck.capacity} size="sm" />
                <div className="mt-1 text-xs text-ink-dim">
                  {truck.capacity.order_count > 0
                    ? `${truck.capacity.order_count} ${truck.capacity.order_count === 1 ? 'order' : 'orders'} on board`
                    : 'Empty'}
                </div>
              </Td>

              <Td>
                <TruckStatusBadge status={truck.status} size="sm" />
              </Td>

              <Td>
                {truck.current_trip_id ? (
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <Code to={`/trips/${truck.current_trip_id}`} className="text-brand">
                        {truck.current_trip_code}
                      </Code>
                      <span className="shrink-0 text-xs tabular-nums text-ink-dim">
                        {Math.round(truck.trip_progress_percent ?? 0)}%
                      </span>
                    </div>
                    <ProgressBar percent={truck.trip_progress_percent ?? 0} />
                    <div className="truncate text-xs">
                      <NextStop truck={truck} />
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-ink-dim">No active trip</span>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      }
    />
  )
}
