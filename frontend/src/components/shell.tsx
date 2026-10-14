import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLive } from '../lib/live'
import type { SearchHit } from '../lib/types'

/* --------------------------------- nav ----------------------------------- */

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
  badge?: 'alerts'
}

/** 20x20 line icons, stroked with currentColor so they inherit nav state. */
const icon = (path: ReactNode) => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-[18px] shrink-0"
    aria-hidden
  >
    {path}
  </svg>
)

const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    end: true,
    icon: icon(
      <>
        <rect x="2.5" y="2.5" width="6" height="6" rx="1.2" />
        <rect x="11.5" y="2.5" width="6" height="6" rx="1.2" />
        <rect x="2.5" y="11.5" width="6" height="6" rx="1.2" />
        <rect x="11.5" y="11.5" width="6" height="6" rx="1.2" />
      </>,
    ),
  },
  {
    to: '/assign',
    label: 'Assign Orders',
    icon: icon(
      <>
        <path d="M3 6h9M3 14h9" />
        <path d="M14 3.5 17 6l-3 2.5M14 11.5 17 14l-3 2.5" />
      </>,
    ),
  },
  {
    to: '/orders',
    label: 'Orders',
    icon: icon(
      <>
        <rect x="3.5" y="2.5" width="13" height="15" rx="1.6" />
        <path d="M6.5 7h7M6.5 10.5h7M6.5 14h4" />
      </>,
    ),
  },
  {
    to: '/trips',
    label: 'Trips',
    icon: icon(
      <>
        <circle cx="5" cy="5" r="2" />
        <circle cx="15" cy="15" r="2" />
        <path d="M5 7.5v3a3 3 0 0 0 3 3h4.5" />
      </>,
    ),
  },
  {
    to: '/trucks',
    label: 'Trucks',
    icon: icon(
      <>
        <path d="M2.5 13.5V5.5a1 1 0 0 1 1-1h7v9" />
        <path d="M10.5 7.5h3.2l2.8 3v3h-6" />
        <circle cx="6" cy="15" r="1.5" />
        <circle cx="14" cy="15" r="1.5" />
      </>,
    ),
  },
  {
    to: '/drivers',
    label: 'Drivers',
    icon: icon(
      <>
        <circle cx="10" cy="6.5" r="3" />
        <path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" />
      </>,
    ),
  },
  {
    to: '/places',
    label: 'Addresses',
    icon: icon(
      <>
        <path d="M10 17.5s5.5-4.6 5.5-9A5.5 5.5 0 0 0 4.5 8.5c0 4.4 5.5 9 5.5 9Z" />
        <circle cx="10" cy="8.5" r="2" />
      </>,
    ),
  },
  {
    to: '/alerts',
    label: 'Alerts',
    badge: 'alerts',
    icon: icon(
      <>
        <path d="M10 2.5 2.5 16h15L10 2.5Z" />
        <path d="M10 7.5v4M10 13.8v.2" />
      </>,
    ),
  },
]

/* ------------------------------ global search ---------------------------- */

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  truck: 'Truck',
  driver: 'Driver',
  order: 'Order',
  billing_party: 'Party',
  trip: 'Trip',
}

function GlobalSearch() {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const navigate = useNavigate()
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 180)
    return () => window.clearTimeout(timer)
  }, [term])

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.search(debounced),
    enabled: debounced.length >= 1,
  })

  const hits = data?.hits ?? []

  useEffect(() => setCursor(0), [debounced])

  // Cmd/Ctrl+K focuses search from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  const go = (hit: SearchHit) => {
    setOpen(false)
    setTerm('')
    navigate(hit.href)
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-lg">
      <div className="relative">
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-dim"
        >
          <path
            fill="currentColor"
            d="M8.5 3a5.5 5.5 0 0 1 4.23 9.02l3.63 3.62a.75.75 0 0 1-1.06 1.06l-3.62-3.62A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
          />
        </svg>
        <input
          ref={inputRef}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
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
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
          placeholder="Search trucks, drivers, orders, trips…"
          aria-label="Global search"
          className="h-9 w-full rounded-md border border-line bg-surface-2 pr-16 pl-9 text-sm
                     transition-colors placeholder:text-ink-dim
                     focus:border-brand focus:bg-surface-1 focus:ring-2 focus:ring-brand/20 focus:outline-none"
        />
        <kbd
          className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-line
                     bg-surface-1 px-1.5 py-0.5 font-sans text-xs font-medium text-ink-dim"
        >
          ⌘K
        </kbd>
      </div>

      {open && debounced.length >= 1 && (
        <div
          className="absolute z-40 mt-2 max-h-[22rem] w-full overflow-auto rounded-lg border border-line
                     bg-surface-1 py-1 shadow-[0_12px_32px_-8px_rgb(15_23_42/0.22)]"
        >
          {isFetching && hits.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-dim">Searching…</p>
          )}
          {!isFetching && hits.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-dim">
              No matches for “{debounced}”
            </p>
          )}
          {hits.map((hit, index) => (
            <button
              key={`${hit.kind}-${hit.id}`}
              onMouseEnter={() => setCursor(index)}
              onClick={() => go(hit)}
              className={clsx(
                'flex w-full items-center gap-3 px-4 py-2 text-left',
                index === cursor ? 'bg-surface-2' : 'hover:bg-surface-2',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {hit.label}
                </span>
                {hit.sublabel && (
                  <span className="block truncate text-xs text-ink-dim">{hit.sublabel}</span>
                )}
              </span>
              <span className="label shrink-0">{KIND_LABEL[hit.kind]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------ live indicator --------------------------- */

function LiveIndicator() {
  const { connected } = useLive()
  return (
    <span
      className="hidden items-center gap-1.5 text-xs font-medium text-ink-dim sm:inline-flex"
      title={
        connected
          ? 'Connected — changes from other operators appear automatically'
          : 'Reconnecting to the live feed'
      }
    >
      <span
        className={clsx(
          'size-1.5 rounded-full',
          connected ? 'bg-st-available' : 'bg-st-assigned',
        )}
      />
      {connected ? 'Live' : 'Reconnecting'}
    </span>
  )
}

/* --------------------------------- shell --------------------------------- */

export function AppShell({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth()
  const [navOpen, setNavOpen] = useState(false)

  // A dedicated count endpoint: the badge must not pull rows to show a
  // number, however many alerts exist.
  const { data: openAlerts = 0 } = useQuery({
    queryKey: ['alerts', 'open-count'],
    queryFn: () => api.openAlertCount(),
    refetchInterval: 60_000,
  })

  const initials = (session?.full_name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar: permanent on desktop, slide-over below lg. */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-line bg-surface-1',
          'transition-transform duration-200 lg:static lg:translate-x-0',
          navOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Link
          to="/"
          onClick={() => setNavOpen(false)}
          className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5"
        >
          <span className="grid size-8 place-items-center rounded-md bg-brand text-sm font-bold text-on-brand">
            F
          </span>
          <span className="text-base font-semibold tracking-tight text-ink">FleetOps</span>
        </Link>

        <nav className="flex-1 overflow-auto p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'mb-0.5 flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                  isActive
                    ? 'bg-brand-tint font-semibold text-brand'
                    : 'font-medium text-ink-soft hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge === 'alerts' && openAlerts > 0 && (
                <span className="rounded-full bg-st-delayed px-1.5 py-0.5 text-xs font-semibold tabular-nums text-on-brand">
                  {openAlerts > 99 ? '99+' : openAlerts}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-ink-soft">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">
                {session?.full_name}
              </span>
              <span className="block truncate text-xs text-ink-dim capitalize">
                {session?.role}
              </span>
            </span>
          </div>
          <button
            onClick={logout}
            className="mt-1 h-8 w-full rounded-md text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </aside>

      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/25 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-4 sm:px-6">
          <button
            onClick={() => setNavOpen((v) => !v)}
            className="grid size-9 shrink-0 place-items-center rounded-md border border-line text-ink-soft hover:bg-surface-2 lg:hidden"
            aria-label="Toggle navigation"
          >
            <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
              <path
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                d="M3 5.5h14M3 10h14M3 14.5h14"
              />
            </svg>
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-4">
            <LiveIndicator />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

/* ------------------------------- page header ----------------------------- */

export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  back,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** Key facts shown as a quiet row beneath the title. */
  meta?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          to={back.to}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-dim transition-colors hover:text-brand"
        >
          <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden>
            <path
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              d="M11 5 6 10l5 5"
            />
          </svg>
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2.5 text-xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          {meta && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-ink-soft">
              {meta}
            </div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/** One fact in a PageHeader `meta` row: quiet label, confident value. */
export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-xs text-ink-dim">{label}</span>
      <span className="font-medium text-ink">{children}</span>
    </span>
  )
}
