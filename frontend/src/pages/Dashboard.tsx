import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtAgo, fmtDayRelative, fmtNumber, fmtTons, pickupRisk } from '../lib/format'
import type { TruckStatus } from '../lib/types'
import { AlertItem } from '../components/alertItem'
import { MetaItem, PageHeader } from '../components/shell'
import {
  EmptyState,
  ErrorNote,
  KpiTile,
  LinkButton,
  Pagination,
  Panel,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
} from '../components/ui'
import {
  EMPTY_TRUCK_FILTER,
  TruckFilterBar,
  TruckTable,
  fleetStatusCounts,
  truckQuery,
  type TruckFilterValue,
} from '../components/truckTable'

export default function Dashboard() {
  const [filter, setFilter] = useState<TruckFilterValue>(EMPTY_TRUCK_FILTER)

  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard(),
    refetchInterval: 30_000,
  })

  // The fleet panel is a paged window onto all 72 trucks, filtered in SQL.
  const trucks = usePaged({
    key: ['trucks', 'dashboard'],
    filters: truckQuery(filter),
    fetchPage: (params) => api.trucks(params),
    pageSize: 10,
    refetchInterval: 45_000,
  })

  // Both queues are short lists by design, so one small page each is the
  // whole panel -- no paging controls needed.
  const alerts = useQuery({
    queryKey: ['alerts', 'dashboard'],
    queryFn: () => api.alerts({ acknowledged: false, page_size: 8 }),
    refetchInterval: 30_000,
  })

  // The soonest collections with no truck yet: the operator's work queue.
  const urgent = useQuery({
    queryKey: ['orders', 'urgent'],
    queryFn: () =>
      api.orders({ unassigned: true, pickup_within_days: 3, page_size: 12 }),
    refetchInterval: 45_000,
  })

  const fleet = dashboard.data?.fleet
  const orders = dashboard.data?.orders
  const urgentOrders = urgent.data?.items ?? []
  const openAlerts = alerts.data?.items ?? []

  // Spare capacity across the whole fleet, from the server's totals. Summing
  // the trucks on screen would report the page's spare room, not the fleet's.
  const freeCapacity = fleet
    ? Math.max(fleet.total_capacity_tons - fleet.total_load_tons, 0)
    : 0

  const statusCounts = useMemo(() => fleetStatusCounts(fleet), [fleet])

  const setStatusFilter = (status: TruckStatus) =>
    setFilter((current) => ({
      ...EMPTY_TRUCK_FILTER,
      statuses:
        current.statuses.length === 1 && current.statuses[0] === status ? [] : [status],
    }))

  return (
    <div className="p-6">
      <PageHeader
        title="Fleet overview"
        subtitle="Everything waiting on you, and the state of all 72 trucks."
        meta={
          fleet && (
            <>
              <MetaItem label="Fleet">{fmtNumber(fleet.total_trucks)} trucks</MetaItem>
              <MetaItem label="Loaded">
                {fmtTons(fleet.total_load_tons)} of {fmtTons(fleet.total_capacity_tons)} (
                {fleet.fleet_utilisation_percent}%)
              </MetaItem>
              {dashboard.data && (
                <span className="text-xs text-ink-dim">
                  Updated {fmtAgo(dashboard.data.generated_at)}
                </span>
              )}
            </>
          )
        }
        actions={
          <>
            <LinkButton to="/orders">View all orders</LinkButton>
            <LinkButton to="/assign" variant="primary">
              Assign orders
            </LinkButton>
          </>
        }
      />

      {/* The six figures that drive the next action. Everything else is a
          detail available one click away. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Orders to assign"
          value={fmtNumber(orders?.pending)}
          sub={`${fmtTons(orders?.pending_tons)} waiting`}
          tone={orders?.pending ? 'text-st-assigned' : undefined}
          to="/assign"
        />
        <KpiTile
          label="Trucks available"
          value={fmtNumber(fleet?.available)}
          sub={`${fmtTons(freeCapacity)} free capacity`}
          tone={fleet?.available ? 'text-st-available' : undefined}
          onClick={() => setStatusFilter('available')}
          active={filter.statuses[0] === 'available'}
        />
        <KpiTile
          label="Active trips"
          value={fmtNumber(fleet?.active_trips)}
          sub={`${fmtTons(orders?.cargo_in_transit_tons)} on board`}
          to="/trips?status=in_progress"
        />
        <KpiTile
          label="Pickup overdue"
          value={fmtNumber(orders?.pickup_overdue)}
          sub="not yet collected"
          tone={orders?.pickup_overdue ? 'text-st-delayed' : undefined}
          to="/orders"
        />
        <KpiTile
          label="Trucks delayed"
          value={fmtNumber(fleet?.delayed)}
          sub={fleet?.without_driver ? `${fleet.without_driver} without a driver` : 'on schedule'}
          tone={fleet?.delayed ? 'text-st-delayed' : undefined}
          onClick={() => setStatusFilter('delayed')}
          active={filter.statuses[0] === 'delayed'}
        />
        <KpiTile
          label="Open alerts"
          value={fmtNumber(dashboard.data?.alerts_open)}
          sub="needing review"
          tone={dashboard.data?.alerts_open ? 'text-st-delayed' : undefined}
          to="/alerts"
        />
      </div>

      {/* Two work queues, side by side. */}
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel
          title="Collect soonest"
          description="Unassigned orders with a pickup date inside 3 days"
          className="h-[23rem]"
          actions={
            <Link to="/assign" className="text-sm font-medium text-brand hover:underline">
              Assign
            </Link>
          }
        >
          {urgent.isLoading ? (
            <Spinner />
          ) : urgentOrders.length === 0 ? (
            <EmptyState
              title="Backlog is clear"
              hint="No unassigned order is due for collection in the next 3 days."
            />
          ) : (
            <Table
              head={
                <>
                  <Th>Order</Th>
                  <Th>Billing party</Th>
                  <Th align="right">Weight</Th>
                  <Th align="right">Pickup</Th>
                </>
              }
            >
              {urgentOrders.map((order) => (
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
                  <Td className="max-w-40">
                    <span className="block truncate text-ink-soft">
                      {order.billing_party}
                    </span>
                  </Td>
                  <Td align="right" className="font-medium tabular-nums">
                    {fmtTons(order.quantity_tons)}
                  </Td>
                  <Td align="right">
                    <span
                      className={
                        pickupRisk(order.pickup_date) === 'overdue'
                          ? 'font-semibold text-st-delayed'
                          : 'font-medium text-st-pickup'
                      }
                    >
                      {fmtDayRelative(order.pickup_date)}
                    </span>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel
          title="Open alerts"
          description={
            dashboard.data?.alerts_open
              ? `${dashboard.data.alerts_open} unacknowledged`
              : undefined
          }
          className="h-[23rem]"
          actions={
            <Link to="/alerts" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          }
        >
          {alerts.isLoading ? (
            <Spinner />
          ) : openAlerts.length === 0 ? (
            <EmptyState
              title="Nothing needs attention"
              hint="No open alerts on the fleet."
            />
          ) : (
            <ul className="divide-y divide-line">
              {openAlerts.map((alert) => (
                <AlertItem key={alert.id} alert={alert} compact />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* The fleet itself. */}
      <Panel
        title="Fleet"
        className="mt-6"
        bodyClassName="overflow-visible"
        actions={
          <Link to="/trucks" className="text-sm font-medium text-brand hover:underline">
            Manage
          </Link>
        }
      >
        <div className="border-b border-line p-4">
          <TruckFilterBar
            value={filter}
            onChange={setFilter}
            statusCounts={statusCounts}
            total={fleet?.total_trucks}
          />
        </div>
        {trucks.isInitialLoading ? (
          <Spinner label="Loading fleet" />
        ) : trucks.isError ? (
          <ErrorNote message="Could not load the fleet." onRetry={() => trucks.refetch()} />
        ) : (
          <>
            <TruckTable trucks={trucks.items} />
            <Pagination
              page={trucks.page}
              onPage={trucks.setPage}
              pageSize={trucks.pageSize}
              onPageSize={trucks.setPageSize}
              noun="trucks"
              busy={trucks.isPlaceholderData}
            />
          </>
        )}
      </Panel>
    </div>
  )
}
