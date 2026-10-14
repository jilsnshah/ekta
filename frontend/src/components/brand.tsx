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
