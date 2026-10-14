import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLive } from '../lib/live'
import type { SearchHit } from '../lib/types'
import { FelesCredit, Logo, LogoMark } from './brand'
import {
  IconAssign,
  IconBell,
  IconBuilding,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCustomers,
  IconDriver,
  IconMore,
  IconOrders,
  IconOverview,
  IconPin,
  IconSearch,
  IconSignOut,
  IconTrips,
  IconTruck,
} from './icons'
import { Avatar } from './ui'

/* --------------------------------- nav ----------------------------------- */

interface NavItem {
  to: string
  label: string
  /** Shorter wording for the phone tab bar. */
  short?: string
  icon: (props: { size?: number }) => ReactNode
  end?: boolean
  badge?: 'alerts'
}

interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * Grouped by what the operator is doing: moving freight, looking after the
 * fleet, or keeping records. Seven flat items read as a list to scan; three
 * groups read as a map.
 */
const NAV: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { to: '/', label: 'Overview', end: true, icon: IconOverview },
      { to: '/assign', label: 'Assign orders', short: 'Assign', icon: IconAssign },
      { to: '/orders', label: 'Orders', icon: IconOrders },
      { to: '/trips', label: 'Trips', icon: IconTrips },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { to: '/trucks', label: 'Trucks', icon: IconTruck },
      { to: '/drivers', label: 'Drivers', icon: IconDriver },
    ],
  },
  {
    label: 'Records',
    items: [
      { to: '/customers', label: 'Customers', icon: IconCustomers },
      { to: '/places', label: 'Addresses', icon: IconPin },
      { to: '/alerts', label: 'Alerts', badge: 'alerts', icon: IconBell },
    ],
  },
]

const ALL_ITEMS = NAV.flatMap((group) => group.items)

/** The four destinations a phone keeps under the thumb. The rest live in More. */
const TAB_ITEMS = ['/', '/assign', '/orders', '/trucks']

/** The section a path belongs to, for the phone title bar. */
function sectionFor(pathname: string): NavItem | undefined {
  if (pathname === '/') return ALL_ITEMS[0]
  return ALL_ITEMS.find((item) => item.to !== '/' && pathname.startsWith(item.to))
}

/* ---------------------------- command palette ---------------------------- */

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  truck: 'Truck',
  driver: 'Driver',
  order: 'Order',
  billing_party: 'Billing party',
  trip: 'Trip',
  customer: 'Customer',
}

const KIND_ICON: Record<SearchHit['kind'], (props: { size?: number }) => ReactNode> = {
  truck: IconTruck,
  driver: IconDriver,
  order: IconOrders,
  billing_party: IconBuilding,
  trip: IconTrips,
  customer: IconCustomers,
}

/**
 * Search everything from anywhere. A palette rather than a dropdown under
 * the top bar: it has room for results on a phone, it works the same on
 * every screen, and ⌘K opens it without reaching for the mouse.
 */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [cursor, setCursor] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 160)
    return () => window.clearTimeout(timer)
  }, [term])

  useEffect(() => {
    if (!open) return
    setTerm('')
    setDebounced('')
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Focus after the sheet has mounted, or iOS will not raise the keyboard.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = previous
    }
  }, [open])

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.search(debounced),
    enabled: open && debounced.length >= 1,
  })

  const hits = data?.hits ?? []
  useEffect(() => setCursor(0), [debounced])

  const go = (hit: SearchHit) => {
    onClose()
    navigate(hit.href)
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center sm:px-6 sm:pt-[12vh]">
      <div
        className="absolute inset-0 animate-fade-in bg-night/45 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative flex h-dvh w-full animate-pop flex-col overflow-hidden bg-surface-1 shadow-overlay sm:h-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-2xl sm:border sm:border-line"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:py-3">
          <IconSearch size={18} className="text-ink-dim" />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setCursor((c) => Math.min(c + 1, hits.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              } else if (event.key === 'Enter' && hits[cursor]) {
                go(hits[cursor])
              } else if (event.key === 'Escape') {
                onClose()
              }
            }}
            placeholder="Search orders, trucks, customers, trips…"
            aria-label="Search"
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-dim focus:outline-none focus-visible:outline-none"
          />
          {isFetching && (
            <span className="size-4 animate-spin rounded-full border-2 border-surface-3 border-t-brand" />
          )}
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm font-medium text-ink-soft hover:bg-surface-2 sm:hidden"
          >
            Cancel
          </button>
          <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-xs text-ink-dim sm:block">
            esc
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {debounced.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-ink">Find anything in the operation</p>
              <p className="mt-1 text-sm text-ink-dim">
                An order code, a registration, a driver, a customer's name or number, or a trip.
              </p>
            </div>
          ) : !isFetching && hits.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-dim">
              Nothing matches “{debounced}”
            </p>
          ) : (
            <ul>
              {hits.map((hit, index) => {
                const Icon = KIND_ICON[hit.kind]
                return (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <button
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => go(hit)}
                      className={clsx(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        index === cursor ? 'bg-brand-tint' : 'hover:bg-surface-2',
                      )}
                    >
                      <span
                        className={clsx(
                          'grid size-8 shrink-0 place-items-center rounded-lg',
                          index === cursor
                            ? 'bg-surface-1 text-brand shadow-button'
                            : 'bg-surface-2 text-ink-dim',
                        )}
                      >
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {hit.label}
                        </span>
                        {hit.sublabel && (
                          <span className="block truncate text-xs text-ink-dim">
                            {hit.sublabel}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-ink-dim">
                        {KIND_LABEL[hit.kind]}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-line bg-surface-2/50 px-4 py-2 text-xs text-ink-dim sm:flex">
          <span>
            <kbd className="font-sans">↑↓</kbd> to move
          </span>
          <span>
            <kbd className="font-sans">↵</kbd> to open
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------ live indicator --------------------------- */

function LiveIndicator() {
  const { connected } = useLive()
  return (
    <span
      className={clsx(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset',
        connected
          ? 'bg-st-available/8 text-st-available ring-st-available/20'
          : 'bg-st-assigned/8 text-st-assigned ring-st-assigned/20',
      )}
      title={
        connected
          ? 'Connected — changes from other operators appear automatically'
          : 'Reconnecting to the live feed'
      }
    >
      <span className="relative flex size-1.5">
        {connected && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-st-available opacity-60" />
        )}
        <span
          className={clsx(
            'relative inline-flex size-1.5 rounded-full',
            connected ? 'bg-st-available' : 'bg-st-assigned',
          )}
        />
      </span>
      {connected ? 'Live' : 'Reconnecting'}
    </span>
  )
}

/* ------------------------------- sidebar --------------------------------- */

function SideNavLink({ item, alerts }: { item: NavItem; alerts: number }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        clsx(
          'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
          isActive
            ? 'bg-night-active font-medium text-on-night'
            : 'text-on-night-dim hover:bg-night-raised hover:text-on-night',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute top-1/2 -left-3 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-glow" />
          )}
          <Icon size={18} />
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge === 'alerts' && alerts > 0 && (
            <span className="min-w-6 rounded-full bg-st-delayed px-1.5 py-px text-center text-xs font-semibold tabular-nums text-white">
              {alerts > 99 ? '99+' : alerts}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

/* --------------------------------- shell --------------------------------- */

export function AppShell({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // A dedicated count endpoint: the badge must not pull rows to show a
  // number, however many alerts exist.
  const { data: openAlerts = 0 } = useQuery({
    queryKey: ['alerts', 'open-count'],
    queryFn: () => api.openAlertCount(),
    refetchInterval: 60_000,
  })

  // ⌘K / Ctrl+K opens search from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Any navigation closes the More sheet.
  useEffect(() => setMoreOpen(false), [location.pathname])

  const section = sectionFor(location.pathname)
  const isTopLevel = ALL_ITEMS.some((item) => item.to === location.pathname)

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* ---------------- desk sidebar ---------------- */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-night lg:flex">
        <Link to="/" className="flex h-16 shrink-0 items-center px-5">
          <Logo tone="dark" caption="Control room" />
        </Link>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 pt-4 pb-6">
          {NAV.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-xs font-medium text-on-night-dim/70">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SideNavLink key={item.to} item={item} alerts={openAlerts} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-night-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={session?.full_name} size={34} tone="dark" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-on-night">
                {session?.full_name}
              </span>
              <span className="block truncate text-xs text-on-night-dim capitalize">
                {session?.role}
              </span>
            </span>
            <button
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="grid size-8 place-items-center rounded-md text-on-night-dim transition-colors hover:bg-night-raised hover:text-on-night"
            >
              <IconSignOut size={17} />
            </button>
          </div>
          <div className="mt-2 border-t border-night-line pt-3">
            <FelesCredit variant="badge" tone="dark" className="flex w-full justify-center" />
          </div>
        </div>
      </aside>

      {/* ---------------- content column ---------------- */}
      <div className="flex min-w-0 flex-col">
        {/* Desk top bar */}
        <header className="sticky top-0 z-30 hidden h-14 items-center gap-4 border-b border-line/70 bg-canvas/85 px-8 backdrop-blur-md lg:flex">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-line bg-surface-1 px-3 text-sm text-ink-dim shadow-button transition-colors hover:border-line-strong"
          >
            <IconSearch size={16} />
            <span className="flex-1 text-left">Search orders, trucks, drivers, trips…</span>
            <kbd className="rounded border border-line bg-surface-2 px-1.5 py-px font-sans text-xs">
              ⌘K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <FelesCredit variant="badge" />
            <LiveIndicator />
          </div>
        </header>

        {/* Phone top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line/70 bg-surface-1/90 pt-[env(safe-area-inset-top)] pr-2 pl-3 backdrop-blur-md lg:hidden">
          {isTopLevel ? (
            <Link to="/" aria-label="Overview" className="mr-1">
              <LogoMark size={30} />
            </Link>
          ) : (
            <button
              onClick={() => {
                // Back within the app when there is somewhere to go back to;
                // a detail page opened from a link goes up to its section.
                const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
                if (idx > 0) navigate(-1)
                else navigate(section?.to ?? '/')
              }}
              aria-label="Back"
              className="-ml-1 grid size-10 place-items-center rounded-lg text-ink-soft active:bg-surface-2"
            >
              <IconChevronLeft size={20} />
            </button>
          )}
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
            {section?.label ?? 'Ekta'}
          </span>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="grid size-10 place-items-center rounded-lg text-ink-soft active:bg-surface-2"
          >
            <IconSearch size={20} />
          </button>
          <Link
            to="/alerts"
            aria-label={`Alerts${openAlerts ? `, ${openAlerts} open` : ''}`}
            className="relative grid size-10 place-items-center rounded-lg text-ink-soft active:bg-surface-2"
          >
            <IconBell size={20} />
            {openAlerts > 0 && (
              <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-st-delayed px-1 text-[10px] leading-4 font-semibold text-white tabular-nums ring-2 ring-surface-1">
                {openAlerts > 99 ? '99+' : openAlerts}
              </span>
            )}
          </Link>
        </header>

        <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          {children}
        </main>
      </div>

      {/* ---------------- phone tab bar ---------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-1/95 pb-safe backdrop-blur-md lg:hidden">
        <div className="grid h-16 grid-cols-5">
          {TAB_ITEMS.map((to) => {
            const item = ALL_ITEMS.find((i) => i.to === to)!
            const Icon = item.icon
            return (
              <NavLink
                key={to}
                to={to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center justify-center gap-1 text-[11px] transition-colors',
                    isActive ? 'font-semibold text-brand' : 'font-medium text-ink-dim',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={clsx(
                        'grid h-7 w-12 place-items-center rounded-full transition-colors',
                        isActive && 'bg-brand-tint',
                      )}
                    >
                      <Icon size={20} />
                    </span>
                    {item.short ?? item.label}
                  </>
                )}
              </NavLink>
            )
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={clsx(
              'flex flex-col items-center justify-center gap-1 text-[11px] transition-colors',
              section && !TAB_ITEMS.includes(section.to)
                ? 'font-semibold text-brand'
                : 'font-medium text-ink-dim',
            )}
          >
            <span
              className={clsx(
                'grid h-7 w-12 place-items-center rounded-full',
                section && !TAB_ITEMS.includes(section.to) && 'bg-brand-tint',
              )}
            >
              <IconMore size={20} />
            </span>
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <MoreSheet
          onClose={() => setMoreOpen(false)}
          alerts={openAlerts}
          name={session?.full_name}
          role={session?.role}
          onLogout={logout}
        />
      )}

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}

/** Everything that does not fit in the phone tab bar, plus the account. */
function MoreSheet({
  onClose,
  alerts,
  name,
  role,
  onLogout,
}: {
  onClose: () => void
  alerts: number
  name?: string
  role?: string
  onLogout: () => void
}) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const rest = ALL_ITEMS.filter((item) => !TAB_ITEMS.includes(item.to))

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end lg:hidden">
      <div
        className="absolute inset-0 animate-fade-in bg-night/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full animate-sheet-up rounded-t-2xl bg-surface-1 pb-safe shadow-overlay">
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-surface-3" />
        </div>
        <div className="flex items-center gap-3 px-5 pt-3 pb-4">
          <Avatar name={name} size={40} tone="brand" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-ink">{name}</span>
            <span className="block truncate text-sm text-ink-dim capitalize">{role}</span>
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-lg text-ink-dim active:bg-surface-2"
          >
            <IconClose size={18} />
          </button>
        </div>
        <ul className="border-y border-line">
          {rest.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    clsx(
                      'flex h-14 items-center gap-4 px-5 text-base transition-colors active:bg-surface-2',
                      isActive ? 'font-semibold text-brand' : 'font-medium text-ink',
                    )
                  }
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-ink-soft">
                    <Icon size={18} />
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge === 'alerts' && alerts > 0 && (
                    <span className="rounded-full bg-st-delayed px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                      {alerts}
                    </span>
                  )}
                  <IconChevronRight size={16} className="text-ink-dim" />
                </NavLink>
              </li>
            )
          })}
        </ul>
        <div className="p-4">
          <button
            onClick={onLogout}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line text-base font-medium text-ink-soft active:bg-surface-2"
          >
            <IconSignOut size={18} />
            Sign out
          </button>
          <div className="mt-4">
            <FelesCredit variant="panel" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------- page frame ------------------------------ */

/** The standard page container: centred, padded, the same on every screen. */
export function PageBody({
  children,
  className,
  wide = false,
}: {
  children: ReactNode
  className?: string
  /** For workspaces like the assignment board that want every pixel. */
  wide?: boolean
}) {
  return (
    <div
      className={clsx(
        'mx-auto w-full px-4 pt-5 pb-8 sm:px-6 lg:px-8 lg:pt-7 lg:pb-12',
        wide ? 'max-w-[1720px]' : 'max-w-[1440px]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  back,
  eyebrow,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** Key facts shown as a quiet row beneath the title. */
  meta?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
  /** A small line above the title, e.g. the record type on a detail page. */
  eyebrow?: ReactNode
}) {
  return (
    <div className="mb-5 lg:mb-7">
      {back && (
        <Link
          to={back.to}
          className="mb-3 hidden items-center gap-1 text-sm font-medium text-ink-dim transition-colors hover:text-brand lg:inline-flex"
        >
          <IconChevronLeft size={15} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5 text-sm text-ink-dim">{eyebrow}</div>}
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xl font-semibold text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">{subtitle}</p>
          )}
          {meta && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-ink-soft">
              {meta}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:*:flex-1">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

/** One fact in a PageHeader `meta` row: quiet label, confident value. */
export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-ink-dim">{label}</span>
      <span className="font-medium text-ink tabular-nums">{children}</span>
    </span>
  )
}
