import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtAgo, fmtDayRelative, fmtNumber, fmtTons, pickupRisk } from '../lib/format'
import { TRUCK_STATUS, TRUCK_STATUS_ORDER } from '../lib/status'
import type { FleetKpis, Order, TruckStatus } from '../lib/types'
import { AlertItem } from '../components/alertItem'
import {
  IconAlert,
  IconArrowRight,
  IconAssign,
  IconBell,
  IconCheck,
  IconClock,
  IconTrips,
} from '../components/icons'
import { PageBody, PageHeader } from '../components/shell'
import {
  Code,
  EmptyState,
  ErrorNote,
  KpiTile,
  LinkButton,
  Pagination,
  Panel,
  Spinner,
  useRowLink,
} from '../components/ui'
import {
  EMPTY_TRUCK_FILTER,
  TruckFilterBar,
  TruckTable,
  fleetStatusCounts,
  truckQuery,
  type TruckFilterValue,
} from '../components/truckTable'

/* ------------------------------ fleet hero ------------------------------- */

/**
 * The whole fleet on one bar: every truck, coloured by what it is doing. It
 * replaces a row of separate status tiles with one picture, and each segment
 * filters the fleet list below -- so "3 delayed" is one click from the three.
 */
function FleetHero({
  fleet,
  active,
  onPick,
}: {
  fleet?: FleetKpis
  active: TruckStatus | null
  onPick: (status: TruckStatus) => void
}) {
  const counts = fleetStatusCounts(fleet)
  const total = fleet?.total_trucks ?? 0
  const free = fleet ? Math.max(fleet.total_capacity_tons - fleet.total_load_tons, 0) : 0

  return (
    <section className="card relative h-full overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p className="text-sm font-medium text-ink-soft">Fleet loaded</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5">
            <span className="text-3xl font-semibold text-ink tabular-nums">
              {fleet ? `${Math.round(fleet.fleet_utilisation_percent)}%` : '—'}
            </span>
            <span className="text-sm text-ink-dim tabular-nums">
              {fleet
                ? `${fmtTons(fleet.total_load_tons)} of ${fmtTons(fleet.total_capacity_tons)}`
                : ''}
            </span>
          </p>
        </div>
        <dl className="flex gap-6 sm:gap-8">
          <div>
            <dt className="text-sm text-ink-dim">Trucks</dt>
            <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
              {fmtNumber(total)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-dim">Free capacity</dt>
            <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
              {fmtTons(free)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-dim">No driver</dt>
            <dd
              className={clsx(
                'mt-0.5 text-lg font-semibold tabular-nums',
                fleet?.without_driver ? 'text-st-delayed' : 'text-ink',
              )}
            >
              {fmtNumber(fleet?.without_driver)}
            </dd>
          </div>
        </dl>
      </div>

      {/* The distribution bar. Gaps between segments keep small counts legible. */}
      <div className="mt-6 flex h-3 gap-[3px]">
        {total === 0 ? (
          <div className="skeleton h-full w-full rounded-full" />
        ) : (
          TRUCK_STATUS_ORDER.map((status) => {
            const n = counts?.[status] ?? 0
            if (!n) return null
            return (
              <button
                key={status}
                tabIndex={-1}
                aria-hidden
                onClick={() => onPick(status)}
                style={{ flexGrow: n }}
                title={`${TRUCK_STATUS[status].label}: ${n}`}
                className={clsx(
                  'h-full min-w-1.5 basis-0 rounded-[3px] transition-opacity first:rounded-l-full last:rounded-r-full',
                  TRUCK_STATUS[status].dot,
                  active && active !== status && 'opacity-20',
                )}
              />
            )
          })
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
        {TRUCK_STATUS_ORDER.map((status) => {
          const meta = TRUCK_STATUS[status]
          const n = counts?.[status] ?? 0
          return (
            <button
              key={status}
              onClick={() => onPick(status)}
              aria-pressed={active === status}
              className={clsx(
                '-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                active === status ? 'bg-surface-2 ring-1 ring-line' : 'hover:bg-surface-2',
                active && active !== status && 'opacity-55',
              )}
            >
              <span className={clsx('size-2 shrink-0 rounded-full', meta.dot)} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{meta.label}</span>
              <span
                className={clsx(
                  'text-sm font-semibold tabular-nums',
                  status === 'delayed' && n > 0 ? 'text-st-delayed' : 'text-ink',
                )}
              >
                {n}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* ------------------------------ work queue ------------------------------- */

function UrgentRow({ order }: { order: Order }) {
  const rowLink = useRowLink(`/orders/${order.id}`)
  const risk = pickupRisk(order.pickup_date)
  return (
    <li
      {...rowLink}
      className={clsx(
        'flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-brand-tint/45 sm:px-5',
        rowLink.className,
      )}
    >
      <span
        className={clsx(
          'grid size-9 shrink-0 place-items-center rounded-lg',
          risk === 'overdue'
            ? 'bg-st-delayed/10 text-st-delayed'
            : 'bg-st-pickup/10 text-st-pickup',
        )}
      >
        <IconClock size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Code to={`/orders/${order.id}`} className="font-semibold">
            {order.code}
          </Code>
          <span className="truncate text-sm text-ink-soft">{order.material}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-dim">
          {order.billing_party} · {order.pickup_name} → {order.drop_name}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-ink tabular-nums">
          {fmtTons(order.quantity_tons)}
        </p>
        <p
          className={clsx(
            'mt-0.5 text-xs font-medium',
            risk === 'overdue' ? 'text-st-delayed' : 'text-st-pickup',
          )}
        >
          {fmtDayRelative(order.pickup_date)}
        </p>
      </div>
    </li>
  )
}

function PanelLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-brand hover:bg-brand-tint"
    >
      {children} <IconArrowRight size={14} />
    </Link>
  )
}

/* -------------------------------- page ----------------------------------- */

export default function Dashboard() {
  const [filter, setFilter] = useState<TruckFilterValue>(EMPTY_TRUCK_FILTER)

  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard(),
    refetchInterval: 30_000,
  })

  // The fleet panel is a paged window onto the whole fleet, filtered in SQL.
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

  const statusCounts = useMemo(() => fleetStatusCounts(fleet), [fleet])

  const activeStatus = filter.statuses.length === 1 ? filter.statuses[0] : null

  const pickStatus = (status: TruckStatus) => {
    setFilter((current) => ({
      ...EMPTY_TRUCK_FILTER,
      statuses:
        current.statuses.length === 1 && current.statuses[0] === status ? [] : [status],
    }))
    // Bring the filtered list into view; on a phone the segment would
    // otherwise change something far off-screen.
    if (window.innerWidth < 1280) {
      window.requestAnimationFrame(() =>
        document.getElementById('fleet')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    }
  }

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <PageBody>
      <PageHeader
        eyebrow={today}
        title="Overview"
        subtitle={
          dashboard.data
            ? `What needs you now, and where the fleet stands. Updated ${fmtAgo(dashboard.data.generated_at)}.`
            : 'What needs you now, and where the fleet stands.'
        }
        actions={
          <LinkButton to="/assign" variant="primary">
            <IconAssign size={17} />
            Assign orders
          </LinkButton>
        }
      />

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <FleetHero fleet={fleet} active={activeStatus} onPick={pickStatus} />
        </div>

        {/* The four figures that drive the next action. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:col-span-5">
          <KpiTile
            label="To assign"
            value={fmtNumber(orders?.pending)}
            sub={`${fmtTons(orders?.pending_tons)} waiting`}
            tone={orders?.pending ? 'text-st-assigned' : undefined}
            icon={<IconAssign size={16} />}
            to="/assign"
          />
          <KpiTile
            label="Pickup overdue"
            value={fmtNumber(orders?.pickup_overdue)}
            sub={orders?.pickup_overdue ? 'not yet collected' : 'nothing late'}
            tone={orders?.pickup_overdue ? 'text-st-delayed' : undefined}
            icon={<IconClock size={16} />}
            to="/orders"
          />
          <KpiTile
            label="Active trips"
            value={fmtNumber(fleet?.active_trips)}
            sub={`${fmtTons(orders?.cargo_in_transit_tons)} on the road`}
            icon={<IconTrips size={16} />}
            to="/trips?status=in_progress"
          />
          <KpiTile
            label="Open alerts"
            value={fmtNumber(dashboard.data?.alerts_open)}
            sub={dashboard.data?.alerts_open ? 'to review' : 'all clear'}
            tone={dashboard.data?.alerts_open ? 'text-st-delayed' : undefined}
            icon={<IconBell size={16} />}
            to="/alerts"
          />
        </div>
      </div>

      {/* Two work queues, side by side. */}
      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 xl:grid-cols-12">
        <Panel
          title="Collect soonest"
          description="No truck yet, pickup within three days"
          className="max-xl:max-h-[30rem] xl:col-span-7 xl:h-[26rem]"
          actions={<PanelLink to="/assign">Assign</PanelLink>}
        >
          {urgent.isLoading ? (
            <Spinner rows={4} />
          ) : urgentOrders.length === 0 ? (
            <EmptyState
              icon={<IconCheck size={20} />}
              title="Backlog is clear"
              hint="No unassigned order is due for collection in the next three days."
            />
          ) : (
            <ul className="divide-y divide-line">
              {urgentOrders.map((order) => (
                <UrgentRow key={order.id} order={order} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Open alerts"
          description={
            dashboard.data?.alerts_open
              ? `${dashboard.data.alerts_open} unacknowledged`
              : 'Nothing flagged'
          }
          className="max-xl:max-h-[30rem] xl:col-span-5 xl:h-[26rem]"
          actions={<PanelLink to="/alerts">View all</PanelLink>}
        >
          {alerts.isLoading ? (
            <Spinner rows={4} />
          ) : openAlerts.length === 0 ? (
            <EmptyState
              icon={<IconCheck size={20} />}
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
      <section id="fleet" className="mt-3 scroll-mt-20 sm:mt-4">
        <Panel
          title="Fleet"
          description={
            fleet
              ? fleet.delayed
                ? `${fleet.delayed} delayed · ${fleet.available} available now`
                : `${fleet.available} available now`
              : undefined
          }
          icon={fleet?.delayed ? <IconAlert size={18} className="text-st-delayed" /> : undefined}
          bodyClassName="overflow-visible"
          actions={<PanelLink to="/trucks">Manage</PanelLink>}
        >
          <div className="border-b border-line p-4 sm:px-5">
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
      </section>
    </PageBody>
  )
}
