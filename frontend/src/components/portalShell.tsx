import clsx from 'clsx'
import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { FelesCredit, Logo } from './brand'
import { IconBuilding, IconChevronLeft, IconOrders, IconPin, IconPlus, IconSignOut } from './icons'
import { Avatar } from './ui'
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

const NAV: NavItem[] = [
  { to: '/portal', label: 'My orders', short: 'Orders', end: true, icon: <IconOrders size={20} /> },
  { to: '/portal/new', label: 'Place an order', short: 'New order', icon: <IconPlus size={20} /> },
  { to: '/portal/addresses', label: 'Saved addresses', short: 'Addresses', icon: <IconPin size={20} /> },
  { to: '/portal/companies', label: 'My companies', short: 'Companies', icon: <IconBuilding size={20} /> },
]

/**
 * The billing party's chrome. Deliberately lighter than the control room: a
 * customer has four things to do, so a top bar is enough on a desk and a tab
 * bar under the thumb on a phone -- no sidebar to scan.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const { party, partyLogout } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-surface-1/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/portal" className="shrink-0">
            <Logo caption="Customer portal" size={32} />
          </Link>

          <nav className="ml-6 hidden items-center gap-1 sm:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'flex h-9 items-center rounded-lg px-3 text-sm transition-colors',
                    isActive
                      ? 'bg-surface-2 font-semibold text-ink ring-1 ring-line'
                      : 'font-medium text-ink-soft hover:bg-surface-2 hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* Wrapped rather than classed: "hidden" and the badge's own
                "inline-flex" are both display utilities, and Tailwind settles
                that by stylesheet order, not by the order given here. */}
            <span className="hidden lg:block">
              <FelesCredit variant="badge" />
            </span>
            <span className="hidden text-right md:block">
              <span className="block text-sm font-medium text-ink">
                {party?.full_name ?? 'Signed in'}
              </span>
              <span className="block font-mono text-xs text-ink-dim">{party?.phone}</span>
            </span>
            <Avatar name={party?.full_name ?? party?.phone} size={34} tone="brand" />
            <button
              onClick={partyLogout}
              aria-label="Sign out"
              title="Sign out"
              className="grid size-10 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <IconSignOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/*
        Phone navigation is a bottom tab bar rather than a hamburger: there
        are only four destinations and they stay in thumb reach. The main
        area carries matching bottom padding, plus the iOS safe-area inset.
      */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 sm:pb-12">
        {children}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <div className="flex flex-col items-center gap-2 border-t border-line pt-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-xs text-ink-dim">
            Ekta — fleet and transport order management
          </p>
          <FelesCredit />
        </div>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-1/95 pb-safe backdrop-blur-md sm:hidden">
        <div className="grid h-16 grid-cols-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
                    {item.icon}
                  </span>
                  {item.short}
                </>
              )}
            </NavLink>
          ))}
        </div>
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
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'h-[22px] px-2 text-xs' : 'h-6 px-2.5 text-[0.8125rem]',
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
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{subtitle}</p>}
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
          className="-ml-1 mb-3 inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm font-medium text-ink-dim transition-colors hover:text-brand"
        >
          <IconChevronLeft size={15} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xl font-semibold text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{subtitle}</p>
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
