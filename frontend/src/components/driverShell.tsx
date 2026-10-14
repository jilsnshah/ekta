import clsx from 'clsx'
import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { LogoMark } from './brand'
import { IconHistory, IconRoute, IconSignOut } from './icons'

const NAV = [
  { to: '/driver', label: 'My trip', end: true, icon: IconRoute },
  { to: '/driver/history', label: 'Past trips', icon: IconHistory },
]

/**
 * The driver's chrome.
 *
 * A driver uses this one-handed, in a cab, often in sunlight. So: a single
 * column capped at phone width even on a desktop (a 1400px-wide trip sheet
 * helps nobody), large tap targets, strong contrast, and the truck they are
 * driving always visible in the header.
 */
export function DriverShell({ children }: { children: ReactNode }) {
  const { driver, driverLogout } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-30 bg-night pt-[env(safe-area-inset-top)] text-on-night">
        <div className="mx-auto flex h-16 w-full max-w-lg items-center gap-3 px-4">
          <Link to="/driver" className="flex min-w-0 items-center gap-3">
            <LogoMark size={34} tone="glass" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[0.9375rem] font-semibold">
                {driver?.name ?? 'Driver'}
              </span>
              <span className="mt-0.5 block truncate font-mono text-xs text-on-night-dim">
                {driver?.truck_registration ?? 'No truck assigned'}
              </span>
            </span>
          </Link>
          <button
            onClick={driverLogout}
            aria-label="Sign out"
            className="ml-auto flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-on-night-dim transition-colors hover:bg-night-raised hover:text-on-night"
          >
            <IconSignOut size={17} />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-1/95 pb-safe backdrop-blur-md">
        <div className="mx-auto grid h-16 max-w-lg grid-cols-2">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center justify-center gap-1 text-xs transition-colors',
                    isActive ? 'font-semibold text-brand' : 'font-medium text-ink-dim',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={clsx(
                        'grid h-7 w-14 place-items-center rounded-full transition-colors',
                        isActive && 'bg-brand-tint',
                      )}
                    >
                      <Icon size={20} />
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            )
          })}
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
    <div className="mb-5">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
    </div>
  )
}
