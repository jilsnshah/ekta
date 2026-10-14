import { Link } from 'react-router-dom'
import { fmtDateTime, fmtTons } from '../lib/format'
import type { OrderBrief, TripBrief } from '../lib/types'
import { Route, PickupWhen } from './orderBits'
import {
  Code,
  ListCard,
  OrderStatusBadge,
  ProgressBar,
  ResponsiveList,
  Table,
  Td,
  Th,
  Tr,
  TripStatusBadge,
} from './ui'

function When({ trip }: { trip: TripBrief }) {
  if (trip.completed_at) return <>Finished {fmtDateTime(trip.completed_at)}</>
  if (trip.started_at) return <>Started {fmtDateTime(trip.started_at)}</>
  return <span className="text-ink-dim">Not started</span>
}

/**
 * A truck's or a driver's past runs. `show` picks the column that is not
 * already obvious from the page: the driver on a truck page, the truck on a
 * driver page.
 */
export function TripHistoryList({
  trips,
  show,
}: {
  trips: TripBrief[]
  show: 'driver' | 'truck'
}) {
  return (
    <ResponsiveList
      breakpoint="2xl"
      cards={
        <ul className="divide-y divide-line">
          {trips.map((trip) => (
            <ListCard key={trip.id} to={`/trips/${trip.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Code to={`/trips/${trip.id}`} className="font-semibold">
                    {trip.code}
                  </Code>
                  <p className="mt-0.5 truncate text-xs text-ink-dim">
                    {show === 'truck' ? trip.truck_registration : trip.driver_name ?? 'No driver'}
                    {' · '}
                    {fmtTons(trip.total_cargo_tons)}
                  </p>
                </div>
                <TripStatusBadge status={trip.status} size="sm" />
              </div>
              <div className="mt-2.5 flex items-center gap-3">
                <span className="shrink-0 text-xs tabular-nums text-ink-soft">
                  {trip.stops_completed}/{trip.stop_count} stops
                </span>
                <ProgressBar
                  percent={trip.progress_percent}
                  tone={trip.status === 'completed' ? 'success' : 'brand'}
                />
              </div>
              <p className="mt-1.5 text-xs text-ink-dim">
                <When trip={trip} />
              </p>
            </ListCard>
          ))}
        </ul>
      }
      table={
        <Table
          minWidth="44rem"
          head={
            <>
              <Th>Trip</Th>
              <Th>{show === 'truck' ? 'Truck' : 'Driver'}</Th>
              <Th>Status</Th>
              <Th align="right">Cargo</Th>
              <Th className="w-44">Stops</Th>
              <Th>When</Th>
            </>
          }
        >
          {trips.map((trip) => (
            <Tr key={trip.id} to={`/trips/${trip.id}`}>
              <Td>
                <Code to={`/trips/${trip.id}`} className="font-semibold">
                  {trip.code}
                </Code>
              </Td>
              <Td>
                {show === 'truck' ? (
                  <Link
                    to={`/trucks/${trip.truck_id}`}
                    className="font-mono text-[0.8125rem] hover:text-brand"
                  >
                    {trip.truck_registration}
                  </Link>
                ) : (
                  <span className="whitespace-nowrap text-ink-soft">{trip.driver_name ?? 'No driver'}</span>
                )}
              </Td>
              <Td>
                <TripStatusBadge status={trip.status} size="sm" />
              </Td>
              <Td align="right" className="font-semibold tabular-nums">
                {fmtTons(trip.total_cargo_tons)}
              </Td>
              <Td>
                <div className="flex items-center gap-2.5">
                  <span className="w-9 shrink-0 text-sm tabular-nums">
                    {trip.stops_completed}
                    <span className="text-ink-dim">/{trip.stop_count}</span>
                  </span>
                  <ProgressBar
                    percent={trip.progress_percent}
                    tone={trip.status === 'completed' ? 'success' : 'brand'}
                  />
                </div>
              </Td>
              <Td className="text-sm whitespace-nowrap text-ink-soft">
                <When trip={trip} />
              </Td>
            </Tr>
          ))}
        </Table>
      }
    />
  )
}

/** Orders currently on a truck: compact, with the route and the pickup clock. */
export function OrdersOnBoard({ orders }: { orders: OrderBrief[] }) {
  return (
    <ResponsiveList
      breakpoint="2xl"
      cards={
        <ul className="divide-y divide-line">
          {orders.map((order) => (
            <ListCard key={order.id} to={`/orders/${order.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Code to={`/orders/${order.id}`} className="font-semibold">
                    {order.code}
                  </Code>
                  <p className="mt-0.5 truncate text-sm text-ink">
                    {order.material}
                    <span className="text-ink-dim"> · {fmtTons(order.quantity_tons)}</span>
                  </p>
                </div>
                <OrderStatusBadge status={order.status} size="sm" />
              </div>
              <div className="mt-2.5">
                <Route from={order.pickup_name} to={order.drop_name} />
              </div>
            </ListCard>
          ))}
        </ul>
      }
      table={
        <Table
          minWidth="44rem"
          head={
            <>
              <Th>Order</Th>
              <Th>Route</Th>
              <Th align="right">Weight</Th>
              <Th>Pickup</Th>
              <Th>Status</Th>
            </>
          }
        >
          {orders.map((order) => (
            <Tr key={order.id} to={`/orders/${order.id}`}>
              <Td>
                <Code to={`/orders/${order.id}`} className="font-semibold">
                  {order.code}
                </Code>
                <div className="mt-0.5 truncate text-xs text-ink-dim">{order.material}</div>
              </Td>
              <Td className="max-w-64">
                <Route from={order.pickup_name} to={order.drop_name} />
              </Td>
              <Td align="right" className="font-semibold tabular-nums">
                {fmtTons(order.quantity_tons)}
              </Td>
              <Td className="whitespace-nowrap">
                <PickupWhen date={order.pickup_date} />
              </Td>
              <Td>
                <OrderStatusBadge status={order.status} size="sm" />
              </Td>
            </Tr>
          ))}
        </Table>
      }
    />
  )
}
