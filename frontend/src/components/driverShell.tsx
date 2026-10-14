import clsx from 'clsx'
import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const NAV = [
  { to: '/driver', label: 'My trip', end: true },
  { to: '/driver/history', label: 'Past trips' },
]

/**
 * The driver's chrome.
 *
 * A driver uses this one-handed, in a cab, often in sunlight. So: a single
 * column capped at phone width even on a desktop (a 1400px-wide trip sheet
 * helps nobody), large tap targets, and the truck they are driving always
 * visible in the header.
 */
export function DriverShell({ children }: { children: ReactNode }) {
  const { driver, driverLogout } = useAuth()

  return (
    <div className="flex min-h-full flex-col bg-surface-0">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-1">
        <div className="mx-auto flex h-16 w-full max-w-lg items-center gap-3 px-4">
          <Link to="/driver" className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand text-sm font-bold text-on-brand">
              F
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-ink">
                {driver?.name ?? 'Driver'}
              </span>
              <span className="block truncate font-mono text-xs text-ink-dim">
                {driver?.truck_registration ?? 'No truck assigned'}
              </span>
            </span>
          </Link>
          <button
            onClick={driverLogout}
            className="ml-auto h-10 shrink-0 rounded-md border border-line px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 pb-24">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-1"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex h-16 items-center justify-center text-sm transition-colors',
                  isActive ? 'font-semibold text-brand' : 'font-medium text-ink-dim',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export function DriverPageTitle({
  title,
  subtitle,
}: {
  title: ReactNode
  subtitle?: ReactNode
}) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
    </div>
  )
}
