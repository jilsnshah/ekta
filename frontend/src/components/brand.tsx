import clsx from 'clsx'
import { useId } from 'react'

/**
 * The Ekta mark: an E drawn as a route. One spine, three arms, a stop at the
 * end of each -- the control room, the customer and the driver meeting on
 * one line. It reads as a letter at 20px and as a diagram at 64px.
 */
export function LogoMark({
  size = 32,
  className,
  tone = 'night',
}: {
  size?: number
  className?: string
  /** `night` sits on light surfaces; `glass` on the night background. */
  tone?: 'night' | 'glass'
}) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={clsx('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.78 0.12 274)" />
          <stop offset="1" stopColor="oklch(0.74 0.12 232)" />
        </linearGradient>
        <linearGradient id={`${id}-t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.27 0.045 270)" />
          <stop offset="1" stopColor="oklch(0.17 0.03 268)" />
        </linearGradient>
      </defs>
      <rect
        width="32"
        height="32"
        rx="8.5"
        fill={tone === 'night' ? `url(#${id}-t)` : 'oklch(1 0 0 / 0.08)'}
        stroke={tone === 'glass' ? 'oklch(1 0 0 / 0.12)' : 'none'}
      />
      <path
        d="M11 8.75v14.5M11 8.75h9.25M11 16h6.25M11 23.25h9.25"
        stroke={`url(#${id}-g)`}
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="21.5" cy="8.75" r="2.25" fill="oklch(0.86 0.09 274)" />
      <circle cx="18.5" cy="16" r="2.25" fill="oklch(0.84 0.09 252)" />
      <circle cx="21.5" cy="23.25" r="2.25" fill="oklch(0.82 0.09 232)" />
    </svg>
  )
}

/** Mark plus wordmark, with an optional line underneath naming the app. */
export function Logo({
  caption,
  tone = 'light',
  size = 32,
}: {
  caption?: string
  /** `light` for light backgrounds, `dark` for the night surfaces. */
  tone?: 'light' | 'dark'
  size?: number
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <LogoMark size={size} tone={tone === 'dark' ? 'glass' : 'night'} />
      <span className="min-w-0 leading-none">
        <span
          className={clsx(
            'block text-[1.0625rem] font-semibold tracking-[-0.02em]',
            tone === 'dark' ? 'text-on-night' : 'text-ink',
          )}
        >
          Ekta
        </span>
        {caption && (
          <span
            className={clsx(
              'mt-1 block truncate text-xs',
              tone === 'dark' ? 'text-on-night-dim' : 'text-ink-dim',
            )}
          >
            {caption}
          </span>
        )}
      </span>
    </span>
  )
}

/* ========================================================================== *
 * Who built it
 * ========================================================================== */

export const FELES = {
  name: 'Feles AI',
  /** The footer wordmark on their own site is set without the space. */
  wordmark: 'FelesAI',
  tagline: 'Intelligence, engineered.',
  description: 'An AI-native software engineering company.',
  location: 'IIT Gandhinagar, Gujarat, India',
  url: 'https://felesai.vercel.app/',
} as const

/**
 * The Feles AI mark, as supplied: a bone-white F and a lime dot on near-black.
 *
 * The file rather than a redrawn path, so the logo is exactly theirs. It
 * carries its own dark ground, which is why it needs no light/dark variant.
 */
export const FELES_COLOURS = {
  ground: '#0a0b09',
  mark: '#f1efe8',
  accent: '#c9f24d',
} as const

export function FelesMark({
  size = 18,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <img
      src="/feles-ai.png"
      width={size}
      height={size}
      alt=""
      aria-hidden
      loading="lazy"
      className={clsx('shrink-0 rounded-[22%]', className)}
      style={{ width: size, height: size }}
    />
  )
}

/**
 * The build credit, in three sizes for three places:
 *
 * - `badge` rides in an app header, so the maker is on screen all day.
 * - `panel` is the prominent block on the sign-in screens.
 * - `line` is a one-line footer.
 *
 * All three link out to Feles AI and carry the same mark, so the credit reads
 * as one identity wherever it appears.
 */
export function FelesCredit({
  variant = 'line',
  tone = 'light',
  className,
}: {
  variant?: 'badge' | 'panel' | 'line'
  tone?: 'light' | 'dark'
  className?: string
}) {
  const dark = tone === 'dark'

  if (variant === 'badge') {
    return (
      <a
        href={FELES.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`${FELES.name} — ${FELES.description}`}
        className={clsx(
          'inline-flex h-7 items-center gap-2 rounded-full px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
          dark
            ? 'bg-white/10 text-on-night hover:bg-white/15'
            : 'bg-surface-2 text-ink-soft ring-1 ring-line ring-inset hover:bg-surface-3 hover:text-ink',
          className,
        )}
      >
        <FelesMark size={15} />
        <span className={dark ? 'text-on-night-dim' : 'text-ink-dim'}>by</span>
        <span className="font-semibold">{FELES.name}</span>
      </a>
    )
  }

  if (variant === 'panel') {
    return (
      <a
        href={FELES.url}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          'group flex items-center gap-3.5 rounded-xl p-4 transition-colors',
          dark
            ? 'bg-white/[0.07] ring-1 ring-white/10 ring-inset hover:bg-white/[0.11]'
            : 'bg-surface-2 ring-1 ring-line ring-inset hover:bg-surface-3',
          className,
        )}
      >
        <FelesMark size={40} />
        <span className="min-w-0 flex-1">
          <span
            className={clsx(
              'block text-xs tracking-wide uppercase',
              dark ? 'text-on-night-dim' : 'text-ink-dim',
            )}
          >
            Designed and built by
          </span>
          <span
            className={clsx(
              'mt-0.5 block text-base font-semibold',
              dark ? 'text-on-night' : 'text-ink',
            )}
          >
            {FELES.name}
          </span>
          <span
            className={clsx(
              'mt-0.5 block text-xs',
              dark ? 'text-on-night-dim' : 'text-ink-soft',
            )}
          >
            {FELES.tagline} · {FELES.location}
          </span>
        </span>
        <span
          className={clsx(
            'shrink-0 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100',
            dark ? 'text-on-night-dim' : 'text-brand',
          )}
          aria-hidden
        >
          Visit →
        </span>
      </a>
    )
  }

  return (
    <a
      href={FELES.url}
      target="_blank"
      rel="noopener noreferrer"
      title={FELES.description}
      className={clsx(
        'inline-flex items-center gap-2 text-sm transition-colors',
        dark ? 'text-on-night-dim hover:text-on-night' : 'text-ink-soft hover:text-ink',
        className,
      )}
    >
      <FelesMark size={18} />
      <span>
        Built by{' '}
        <span className={clsx('font-semibold', !dark && 'text-ink')}>{FELES.name}</span>
        <span className={clsx('hidden sm:inline', dark ? '' : 'text-ink-dim')}>
          {' · '}
          {FELES.location}
        </span>
      </span>
    </a>
  )
}
