import clsx from 'clsx'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Logo } from './brand'
import { IconCheck } from './icons'

/**
 * The route drawing behind the sign-in panel: three lines -- the control
 * room, the customer and the driver -- converging on one consignment. It is
 * the logo's idea at full size.
 */
function RouteArt() {
  return (
    <svg
      viewBox="0 0 560 360"
      className="pointer-events-none absolute -right-10 -bottom-10 w-[32rem] max-w-none opacity-80"
      aria-hidden
    >
      <defs>
        <linearGradient id="ekta-route" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="oklch(0.78 0.12 274)" stopOpacity="0" />
          <stop offset="0.5" stopColor="oklch(0.78 0.12 274)" stopOpacity="0.7" />
          <stop offset="1" stopColor="oklch(0.8 0.1 232)" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#ekta-route)" strokeWidth="2" strokeLinecap="round">
        <path d="M0 70 C 160 70, 220 180, 380 180" />
        <path d="M0 180 C 140 180, 240 180, 380 180" />
        <path d="M0 300 C 160 300, 220 180, 380 180" />
        <path d="M380 180 C 440 180, 470 120, 560 110" strokeDasharray="2 8" />
      </g>
      <g>
        {[
          [120, 86],
          [150, 180],
          [120, 274],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="oklch(0.86 0.09 274)" />
        ))}
        <circle cx="380" cy="180" r="22" fill="oklch(0.78 0.12 274 / 0.12)" />
        <circle cx="380" cy="180" r="9" fill="oklch(0.86 0.09 252)" />
      </g>
    </svg>
  )
}

const AUDIENCES = [
  { to: '/login', label: 'Control room' },
  { to: '/portal/login', label: 'Customer' },
  { to: '/driver/login', label: 'Driver' },
]

/**
 * Every sign-in screen: a brand panel and a form. On a desk they sit side by
 * side; on a phone the brand shrinks to a band above the form so the fields
 * are what the screen opens on.
 */
export function AuthLayout({
  caption,
  headline,
  points,
  children,
}: {
  caption: string
  headline: string
  points: string[]
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-surface-1 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(28rem,36rem)]">
      {/* Brand panel */}
      <aside className="night-grid relative overflow-hidden text-on-night">
        <div className="relative z-10 flex flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8 sm:px-10 lg:h-full lg:px-14 lg:py-12">
          <Logo tone="dark" caption={caption} size={36} />
          <div className="mt-8 max-w-lg lg:mt-auto lg:mb-auto">
            <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.03em] lg:text-[2.5rem]">
              {headline}
            </h1>
            <ul className="mt-6 hidden space-y-3 lg:block">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-on-night-dim">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-on-night">
                    <IconCheck size={12} strokeWidth={2.4} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-6 hidden text-sm text-on-night-dim/70 lg:block">
            One operation, three views of every consignment.
          </p>
        </div>
        <div className="hidden lg:block">
          <RouteArt />
        </div>
      </aside>

      {/* Form */}
      <main className="flex flex-col px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-10 lg:justify-center lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <nav
            aria-label="Choose an app"
            className="mb-8 grid grid-cols-3 rounded-xl bg-surface-2 p-1 ring-1 ring-line ring-inset"
          >
            {AUDIENCES.map((audience) => (
              <NavLink
                key={audience.to}
                to={audience.to}
                className={({ isActive }) =>
                  clsx(
                    'grid h-9 place-items-center rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-surface-1 text-ink shadow-button ring-1 ring-line'
                      : 'text-ink-dim hover:text-ink',
                  )
                }
              >
                {audience.label}
              </NavLink>
            ))}
          </nav>
          {children}
        </div>
      </main>
    </div>
  )
}

/** The heading block above each sign-in form. */
export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      {children && <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{children}</p>}
    </div>
  )
}
