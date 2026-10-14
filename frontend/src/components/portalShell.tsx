import clsx from 'clsx'
import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { STAGE_META } from '../lib/stage'
import type { OrderStage } from '../lib/types'

interface NavItem {
  to: string
  label: string
  /** Shorter wording for the bottom tab bar. */
  short: string
  icon: ReactNode
  end?: boolean
}

const navIcon = (path: ReactNode) => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-5 shrink-0"
    aria-hidden
  >
    {path}
  </svg>
)

const NAV: NavItem[] = [
  {
    to: '/portal',
    label: 'My orders',
    short: 'Orders',
    end: true,
    icon: navIcon(
      <>
        <rect x="3.5" y="2.5" width="13" height="15" rx="1.6" />
        <path d="M6.5 7h7M6.5 10.5h7M6.5 14h4" />
      </>,
    ),
  },
  {
    to: '/portal/new',
    label: 'Place an order',
    short: 'New order',
    icon: navIcon(
      <>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 6.5v7M6.5 10h7" />
      </>,
    ),
  },
  {
    to: '/portal/addresses',
    label: 'Saved addresses',
    short: 'Addresses',
    icon: navIcon(
      <>
        <path d="M10 17.5s5.5-4.6 5.5-9A5.5 5.5 0 0 0 4.5 8.5c0 4.4 5.5 9 5.5 9Z" />
        <circle cx="10" cy="8.5" r="2" />
      </>,
    ),
  },
  {
    to: '/portal/companies',
    label: 'My companies',
    short: 'Companies',
    icon: navIcon(
      <>
        <rect x="3" y="6" width="9" height="11.5" rx="1.3" />
        <path d="M12 9.5h4.2a.8.8 0 0 1 .8.8v7.2H12M6 9.5h3M6 12.5h3M6 15.5h3" />
      </>,
    ),
  },
]

/**
 * The billing party's chrome. Deliberately lighter than the control room:
 * a party has three things to do, so a top bar is enough and there is no
 * sidebar to scan.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const { party, partyLogout } = useAuth()

  return (
    <div className="flex min-h-full flex-col bg-surface-0">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-1">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/portal" className="flex shrink-0 items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md bg-brand text-sm font-bold text-on-brand">
              F
            </span>
            <span className="leading-tight">
              <span className="block text-base font-semibold tracking-tight text-ink">
                FleetOps
              </span>
              <span className="block text-xs text-ink-dim">Customer portal</span>
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'flex h-9 items-center rounded-md px-3 text-sm transition-colors',
                    isActive
                      ? 'bg-brand-tint font-semibold text-brand'
                      : 'font-medium text-ink-soft hover:bg-surface-2 hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-medium text-ink">
                {party?.full_name ?? 'Signed in'}
              </span>
              <span className="block text-xs text-ink-dim">{party?.phone}</span>
            </span>
            <button
              onClick={partyLogout}
              className="h-10 rounded-md border border-line px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/*
        Phone navigation is a bottom tab bar rather than a hamburger: there
        are only three destinations and they stay in thumb reach. The main
        area carries matching bottom padding, plus the iOS safe-area inset.
      */}
      <main
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 sm:px-6 sm:py-6 sm:pb-6"
      >
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface-1 sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors',
                isActive ? 'font-semibold text-brand' : 'font-medium text-ink-dim',
              )
            }
          >
            {item.icon}
            {item.short}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/** The party-facing progress chip. */
export function StageBadge({ stage, size = 'md' }: { stage: OrderStage; size?: 'sm' | 'md' }) {
  const meta = STAGE_META[stage] ?? STAGE_META.placed
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-[3px] text-sm',
        meta.chip,
      )}
    >
      <span className={clsx('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

/** A plain title and one line of help, for the step-by-step screens. */
export function PortalPageTitle({
  title,
  subtitle,
}: {
  title: ReactNode
  subtitle?: ReactNode
}) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
    </div>
  )
}

export function PortalPageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode
  subtitle?: ReactNode
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
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
