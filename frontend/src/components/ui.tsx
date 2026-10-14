import clsx from 'clsx'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { fmtTons } from '../lib/format'
import {
  DRIVER_STATUS,
  ORDER_STATUS,
  SEVERITY,
  STOP_TYPE,
  TRIP_STATUS,
  TRUCK_STATUS,
  loadTone,
  type StatusMeta,
} from '../lib/status'
import { pageRange as pageBounds, type Page as PageInfo } from '../lib/paging'
import type {
  Capacity,
  DriverStatus,
  OrderStatus,
  StopType,
  TripStatus,
  TruckStatus,
} from '../lib/types'
import {
  IconAlert,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconInfo,
  IconSearch,
} from './icons'

/* ========================================================================== *
 * Status pills
 * ========================================================================== */

/**
 * Every status in the product is the same pill: a dot, a label, a soft tint
 * of the status hue. No border -- the tint is enough, and borders on every
 * pill made dense tables look caged.
 */
function Badge({
  meta,
  size = 'md',
  withDot = true,
}: {
  meta: StatusMeta
  size?: 'sm' | 'md'
  withDot?: boolean
}) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'h-[22px] px-2 text-xs' : 'h-6 px-2.5 text-[0.8125rem]',
        meta.chip,
      )}
    >
      {withDot && <span className={clsx('size-1.5 rounded-full', meta.dot)} />}
      {meta.label}
    </span>
  )
}

export function TruckStatusBadge({
  status,
  size = 'md',
}: {
  status: TruckStatus
  size?: 'sm' | 'md'
}) {
  return <Badge meta={TRUCK_STATUS[status] ?? TRUCK_STATUS.maintenance} size={size} />
}

export function OrderStatusBadge({
  status,
  size = 'md',
}: {
  status: OrderStatus
  size?: 'sm' | 'md'
}) {
  return <Badge meta={ORDER_STATUS[status] ?? ORDER_STATUS.unassigned} size={size} />
}

export function TripStatusBadge({
  status,
  size = 'md',
}: {
  status: TripStatus
  size?: 'sm' | 'md'
}) {
  return <Badge meta={TRIP_STATUS[status] ?? TRIP_STATUS.planned} size={size} />
}

export function DriverStatusBadge({
  status,
  size = 'md',
}: {
  status: DriverStatus
  size?: 'sm' | 'md'
}) {
  return <Badge meta={DRIVER_STATUS[status] ?? DRIVER_STATUS.unavailable} size={size} />
}

export function SeverityBadge({
  severity,
  size = 'sm',
}: {
  severity: string
  size?: 'sm' | 'md'
}) {
  return <Badge meta={SEVERITY[severity] ?? SEVERITY.info} size={size} />
}

/** Pickup / delivery leg marker, used on every stop list. */
export function StopTypeBadge({ type }: { type: StopType }) {
  const meta = STOP_TYPE[type]
  return (
    <span
      className={clsx(
        'inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-xs font-semibold',
        meta.chip,
      )}
    >
      {meta.label}
    </span>
  )
}

/** Neutral count / metadata pill. No semantic colour. */
export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex h-[22px] shrink-0 items-center rounded-full bg-surface-2 px-2 text-xs font-medium text-ink-soft ring-1 ring-line ring-inset',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Initials in a circle, for people. */
export function Avatar({
  name,
  size = 32,
  tone = 'light',
}: {
  name?: string | null
  size?: number
  tone?: 'light' | 'dark' | 'brand'
}) {
  const initials = (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={clsx(
        'grid shrink-0 place-items-center rounded-full font-semibold tracking-tight',
        tone === 'light' && 'bg-surface-3 text-ink-soft',
        tone === 'dark' && 'bg-night-active text-on-night',
        tone === 'brand' && 'bg-brand-tint text-brand',
      )}
      aria-hidden
    >
      {initials || '?'}
    </span>
  )
}

/* ========================================================================== *
 * Capacity and progress
 * ========================================================================== */

/**
 * The load visual used wherever capacity matters. Reads as "14T / 20T" with
 * the free headroom beside it and a bar that warns as it fills.
 */
export function CapacityBar({
  capacity,
  size = 'md',
  pendingTons = 0,
  barOnly = false,
}: {
  capacity: Capacity
  size?: 'sm' | 'md'
  /** Tons being staged for assignment, drawn as a hatched overlay. */
  pendingTons?: number
  /** Just the bar, when the figures are already stated beside it. */
  barOnly?: boolean
}) {
  const total = capacity.capacity_tons || 1
  const usedPct = Math.min((capacity.current_load_tons / total) * 100, 100)
  const pendingPct = Math.min((pendingTons / total) * 100, 100 - usedPct)
  const overflow = Math.max(capacity.current_load_tons + pendingTons - total, 0)
  const tone = loadTone(((capacity.current_load_tons + pendingTons) / total) * 100)
  const free = Math.max(capacity.available_tons - pendingTons, 0)

  return (
    <div className="w-full space-y-1.5">
      <div className={clsx('flex items-baseline justify-between gap-3', barOnly && 'hidden')}>
        <span
          className={clsx(
            'font-semibold tabular-nums',
            size === 'sm' ? 'text-sm' : 'text-base',
            tone.text,
          )}
        >
          {fmtTons(capacity.current_load_tons + pendingTons)}
          <span className="font-normal text-ink-dim"> / {fmtTons(capacity.capacity_tons)}</span>
        </span>
        <span
          className={clsx(
            'shrink-0 tabular-nums',
            size === 'sm' ? 'text-xs' : 'text-sm',
            overflow > 0 ? 'font-semibold text-st-delayed' : 'text-ink-dim',
          )}
        >
          {overflow > 0 ? `${fmtTons(overflow)} over` : `${fmtTons(free)} free`}
        </span>
      </div>
      <div
        className={clsx(
          'relative overflow-hidden rounded-full bg-surface-3',
          size === 'sm' ? 'h-1.5' : 'h-2',
        )}
        role="meter"
        aria-valuenow={Math.round(capacity.current_load_tons + pendingTons)}
        aria-valuemin={0}
        aria-valuemax={capacity.capacity_tons}
        aria-label="Truck load"
      >
        <div
          className={clsx(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-300',
            tone.bar,
          )}
          style={{ width: `${usedPct}%` }}
        />
        {pendingPct > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-full bg-brand transition-[width] duration-300"
            style={{
              left: `${usedPct}%`,
              width: `${pendingPct}%`,
              backgroundImage:
                'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.4) 0 3px, transparent 3px 6px)',
            }}
          />
        )}
      </div>
    </div>
  )
}

export function ProgressBar({
  percent,
  label,
  tone = 'brand',
}: {
  percent: number
  label?: string
  tone?: 'brand' | 'success'
}) {
  const bar = tone === 'success' ? 'bg-st-available' : 'bg-brand'
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <div className="flex justify-between text-xs">
          <span className="text-ink-dim">{label}</span>
          <span className="font-medium tabular-nums text-ink-soft">
            {Math.round(percent)}%
          </span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className={clsx('h-full rounded-full transition-[width] duration-500', bar)}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
    </div>
  )
}

/* ========================================================================== *
 * Layout
 * ========================================================================== */

/**
 * A headline figure. `tone` colours only the number, so a row of tiles stays
 * calm and the one that needs attention stands out; `icon` gives the tile a
 * glyph that tells the figures apart at a glance.
 */
export function KpiTile({
  label,
  value,
  sub,
  tone,
  to,
  onClick,
  active = false,
  icon,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: string
  /** Navigate to a page. Use for figures whose detail lives elsewhere. */
  to?: string
  /** Filter in place. Use for figures the list below can narrow to. */
  onClick?: () => void
  active?: boolean
  icon?: ReactNode
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[0.8125rem] font-medium text-ink-soft">{label}</span>
        {icon && (
          <span
            className={clsx(
              'grid size-7 shrink-0 place-items-center rounded-lg transition-colors',
              active ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink-dim',
            )}
          >
            {icon}
          </span>
        )}
      </span>
      <span
        className={clsx(
          'mt-2 block text-2xl font-semibold tabular-nums',
          tone ?? 'text-ink',
        )}
      >
        {value}
      </span>
      {sub && <span className="mt-0.5 block truncate text-xs text-ink-dim">{sub}</span>}
    </>
  )

  const shell =
    'card group block min-w-0 px-4 py-3.5 text-left transition-[border-color,box-shadow,background-color] duration-150'
  const hover = 'cursor-pointer hover:border-line-strong hover:shadow-raised'

  if (to) {
    return (
      <Link to={to} className={clsx(shell, hover)}>
        {body}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button
        onClick={onClick}
        aria-pressed={active}
        className={clsx(
          shell,
          hover,
          active && 'border-brand/40 bg-brand-tint ring-1 ring-brand/30 hover:border-brand/40',
        )}
      >
        {body}
      </button>
    )
  }

  return <div className={shell}>{body}</div>
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  icon,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  icon?: ReactNode
}) {
  return (
    <section className={clsx('card flex min-h-0 flex-col overflow-hidden', className)}>
      {(title || actions) && (
        <header className="flex shrink-0 items-center justify-between gap-4 px-4 pt-3.5 pb-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className="text-ink-dim">{icon}</span>}
            <div className="min-w-0">
              <h2 className="truncate text-[0.9375rem] font-semibold text-ink">{title}</h2>
              {description && (
                <p className="mt-0.5 truncate text-xs text-ink-dim">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div
        className={clsx(
          'min-h-0 flex-1',
          (title || actions) && 'border-t border-line',
          bodyClassName ?? 'overflow-auto',
        )}
      >
        {children}
      </div>
    </section>
  )
}

/** A labelled value, for detail pages. */
export function Stat({
  label,
  value,
  mono = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={clsx('mt-1 text-sm font-medium text-ink', mono && 'font-mono')}>
        {value}
      </div>
    </div>
  )
}

/** Label/value rows, the standard way a detail page lists facts. */
export function FactList({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode; mono?: boolean } | false | null | undefined | ''>
  className?: string
}) {
  return (
    <dl className={clsx('divide-y divide-line', className)}>
      {items.filter(Boolean).map((item) => {
        const fact = item as { label: string; value: ReactNode; mono?: boolean }
        return (
          <div
            key={fact.label}
            className="flex items-baseline justify-between gap-4 px-4 py-3 sm:px-5"
          >
            <dt className="shrink-0 text-sm text-ink-dim">{fact.label}</dt>
            <dd
              className={clsx(
                'min-w-0 text-right text-sm font-medium text-ink',
                fact.mono && 'font-mono',
              )}
            >
              {fact.value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/* ========================================================================== *
 * Controls
 * ========================================================================== */

const BUTTON_BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-45'

// Comfortable to tap on a phone, tighter on a pointer device from sm up.
const BUTTON_SIZE = {
  sm: 'h-9 px-3 text-sm sm:h-8 sm:px-2.5',
  md: 'h-11 px-4 text-[0.9375rem] sm:h-9 sm:px-3.5 sm:text-sm',
  lg: 'h-12 px-5 text-base',
}

const BUTTON_VARIANT = {
  primary:
    'bg-brand text-on-brand shadow-brand hover:bg-brand-hover border border-transparent',
  secondary:
    'border border-line bg-surface-1 text-ink shadow-button hover:border-line-strong hover:bg-surface-2',
  ghost: 'border border-transparent bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink',
  danger:
    'border border-st-delayed/25 bg-surface-1 text-st-delayed shadow-button hover:bg-st-delayed/8',
  dark: 'border border-transparent bg-night text-on-night hover:bg-night-raised',
}

export type ButtonVariant = keyof typeof BUTTON_VARIANT

export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: keyof typeof BUTTON_SIZE = 'md',
  className?: string,
) {
  return clsx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className)
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: keyof typeof BUTTON_SIZE
}) {
  return (
    <button type={type} {...rest} className={buttonClass(variant, size, className)}>
      {children}
    </button>
  )
}

/** A square, icon-only button. Always give it a label for screen readers. */
export function IconButton({
  label,
  children,
  className,
  variant = 'ghost',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  variant?: 'ghost' | 'secondary'
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={clsx(
        'grid size-10 shrink-0 place-items-center rounded-lg transition-colors sm:size-9',
        'disabled:pointer-events-none disabled:opacity-35',
        variant === 'ghost' && 'text-ink-soft hover:bg-surface-2 hover:text-ink',
        variant === 'secondary' &&
          'border border-line bg-surface-1 text-ink-soft shadow-button hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** A router link styled as a button, so navigation and actions look alike. */
export function LinkButton({
  to,
  children,
  variant = 'secondary',
  size = 'md',
  className,
}: {
  to: string
  children: ReactNode
  variant?: ButtonVariant
  size?: keyof typeof BUTTON_SIZE
  className?: string
}) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  )
}

const FIELD_BASE =
  'w-full rounded-lg border border-line bg-surface-1 text-ink shadow-button ' +
  'transition-[border-color,box-shadow] placeholder:text-ink-dim ' +
  'hover:border-line-strong focus:border-brand focus:ring-3 focus:ring-brand/15 focus:outline-none ' +
  'disabled:bg-surface-2 disabled:text-ink-dim'

// 16px on phones stops iOS zooming into the field on focus.
export const inputClass = `${FIELD_BASE} h-11 px-3 text-base sm:h-10 sm:text-sm`

export const textareaClass = `${FIELD_BASE} px-3 py-2.5 text-base leading-relaxed sm:text-sm`

/** Native select, restyled to match the inputs. */
export const selectClass =
  `${FIELD_BASE} h-11 appearance-none pr-9 pl-3 text-base sm:h-10 sm:text-sm ` +
  "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22none%22 stroke=%22%23767c8f%22 stroke-width=%221.6%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 8 4 4 4-4%22/></svg>')] " +
  'bg-[length:1.1rem] bg-[position:right_0.6rem_center] bg-no-repeat'

export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional = false,
}: {
  label: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
  optional?: boolean
}) {
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <span className="flex items-baseline gap-1.5 text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-ink-dim">Optional</span>}
      </span>
      {children}
      {error ? (
        <span className="text-xs font-medium text-st-delayed">{error}</span>
      ) : (
        hint && <span className="text-xs leading-relaxed text-ink-dim">{hint}</span>
      )}
    </label>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  return (
    <div className={clsx('relative', className)}>
      <IconSearch
        size={16}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-dim"
      />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={clsx(inputClass, 'pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-dim hover:bg-surface-2 hover:text-ink sm:size-7"
        >
          <IconClose size={14} />
        </button>
      )}
    </div>
  )
}

/** One filter chip. Group them in a `ChipBar`. */
export function FilterChip({
  active,
  onClick,
  children,
  count,
  dot,
  className,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  count?: number
  dot?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors sm:h-8',
        active
          ? 'bg-night text-on-night shadow-button'
          : 'bg-surface-1 text-ink-soft ring-1 ring-line ring-inset hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {dot && <span className={clsx('size-1.5 rounded-full', dot)} />}
      {children}
      {count !== undefined && (
        <span
          className={clsx(
            'tabular-nums',
            active ? 'text-on-night-dim' : 'text-ink-dim',
          )}
        >
          {count.toLocaleString('en-IN')}
        </span>
      )}
    </button>
  )
}

/**
 * A single row of chips that scrolls sideways rather than wrapping. On a
 * phone, nine status filters wrapped onto four lines and pushed the list off
 * the screen; one swipeable row keeps them all a thumb away.
 */
export function ChipBar({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('-mx-4 sm:mx-0', className)}>
      <div className="scroller-x fade-x gap-1.5 px-4 py-0.5 sm:fade-x sm:px-0.5">
        {children}
      </div>
    </div>
  )
}

/** A divider between chip groups in a ChipBar. */
export function ChipDivider() {
  return <span className="mx-1 h-5 w-px shrink-0 self-center bg-line" aria-hidden />
}

/** Mutually exclusive options, shown together. For sort orders and views. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (next: T) => void
  options: Array<{ value: T; label: ReactNode }>
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="radiogroup"
      className={clsx(
        'inline-flex max-w-full min-w-0 shrink-0 rounded-lg bg-surface-2 p-0.5 ring-1 ring-line ring-inset',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'min-w-0 flex-1 truncate rounded-md px-2 font-medium whitespace-nowrap transition-[background-color,color,box-shadow] sm:px-2.5',
            size === 'sm' ? 'h-8 text-xs sm:h-7' : 'h-10 text-sm sm:h-8',
            value === option.value
              ? 'bg-surface-1 text-ink shadow-button ring-1 ring-line'
              : 'text-ink-dim hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ========================================================================== *
 * Row navigation
 * ========================================================================== */

/**
 * Selector for anything that handles its own clicks. A row-level click that
 * starts inside one of these is left alone, so nested links, phone numbers
 * and action buttons keep working without each needing stopPropagation.
 */
const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="link"]'

export function startedOnInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null
}

/** HashRouter keeps the route after the "#", so a new tab needs it rebuilt. */
function externalHref(to: string): string {
  return `${window.location.pathname}${window.location.search}#${to}`
}

/**
 * Makes an entire row or card navigate to `to` when clicked.
 *
 * The row is deliberately not focusable and carries no link role: the primary
 * identifier inside it is already a real anchor, which is the keyboard and
 * screen-reader path. Adding a second one would double every tab stop and
 * announce each row twice. This is the pointer affordance only.
 *
 * Modifier-click and middle-click open a new tab, matching a real link.
 */
export interface RowLinkProps {
  onClick?: (event: React.MouseEvent) => void
  onAuxClick?: (event: React.MouseEvent) => void
  className?: string
}

export function useRowLink(to?: string): RowLinkProps {
  const navigate = useNavigate()

  if (!to) return {}

  return {
    onClick: (event: React.MouseEvent) => {
      if (startedOnInteractive(event.target)) return
      // A drag that selected text inside this row was a selection, not a
      // click. A selection elsewhere on the page must not block navigation,
      // so this checks the selection actually sits in this row.
      const selection = window.getSelection()
      if (
        selection &&
        !selection.isCollapsed &&
        selection.anchorNode &&
        event.currentTarget instanceof Node &&
        event.currentTarget.contains(selection.anchorNode)
      ) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        window.open(externalHref(to), '_blank', 'noopener')
        return
      }
      navigate(to)
    },
    onAuxClick: (event: React.MouseEvent) => {
      if (event.button !== 1 || startedOnInteractive(event.target)) return
      event.preventDefault()
      window.open(externalHref(to), '_blank', 'noopener')
    },
    className: 'cursor-pointer',
  }
}

/* ========================================================================== *
 * Tables
 * ========================================================================== */

/** Shared table chrome, so every table on every page matches. */
export function Table({
  head,
  children,
  minWidth,
}: {
  head: ReactNode
  children: ReactNode
  minWidth?: string
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-left"
        style={minWidth ? { minWidth } : undefined}
      >
        <thead className="bg-surface-2/70">
          <tr className="border-b border-line">{head}</tr>
        </thead>
        <tbody className="divide-y divide-line/80">{children}</tbody>
      </table>
    </div>
  )
}

export function Th({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <th
      scope="col"
      className={clsx(
        'label h-10 px-4 font-medium whitespace-nowrap first:pl-5 last:pr-5',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Tr({
  children,
  to,
  className,
}: {
  children: ReactNode
  /** When set, clicking anywhere on the row navigates here. */
  to?: string
  className?: string
}) {
  const rowLink = useRowLink(to)
  return (
    <tr
      {...rowLink}
      className={clsx(
        'group/row transition-colors',
        to ? 'hover:bg-brand-tint/45' : 'hover:bg-surface-2/50',
        rowLink.className,
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function Td({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <td
      className={clsx(
        'px-4 py-3 align-middle text-sm first:pl-5 last:pr-5',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </td>
  )
}

/**
 * Renders `cards` on narrow screens and `table` from `breakpoint` up.
 *
 * A dense table cannot be made comfortable on a narrow screen -- it either
 * scrolls sideways or shrinks past readability -- so every list supplies two
 * presentations of the same rows. Wide control-room tables switch at `xl`,
 * because below that the sidebar leaves less room than the columns need.
 */
const LIST_BREAKPOINT = {
  md: ['md:hidden', 'hidden md:block'],
  lg: ['lg:hidden', 'hidden lg:block'],
  xl: ['xl:hidden', 'hidden xl:block'],
  '2xl': ['2xl:hidden', 'hidden 2xl:block'],
} as const

export function ResponsiveList({
  cards,
  table,
  breakpoint = 'md',
}: {
  cards: ReactNode
  table: ReactNode
  breakpoint?: keyof typeof LIST_BREAKPOINT
}) {
  const [cardClass, tableClass] = LIST_BREAKPOINT[breakpoint]
  return (
    <>
      <div className={cardClass}>{cards}</div>
      <div className={tableClass}>{table}</div>
    </>
  )
}

/**
 * One tappable row in a phone list. The whole card opens `to`; nested links
 * and buttons keep their own behaviour.
 */
export function ListCard({
  to,
  children,
  className,
}: {
  to?: string
  children: ReactNode
  className?: string
}) {
  const rowLink = useRowLink(to)
  return (
    <li
      {...rowLink}
      className={clsx(
        'px-4 py-3.5 transition-colors',
        to && 'active:bg-surface-2',
        rowLink.className,
        className,
      )}
    >
      {children}
    </li>
  )
}

/** The two-line cell used for "primary identifier + one supporting fact". */
export function CellStack({
  primary,
  secondary,
}: {
  primary: ReactNode
  secondary?: ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-ink">{primary}</div>
      {secondary && <div className="mt-0.5 truncate text-xs text-ink-dim">{secondary}</div>}
    </div>
  )
}

/** An order code, registration or trip code: mono, and a link when it can be. */
export function Code({
  to,
  children,
  className,
}: {
  to?: string
  children: ReactNode
  className?: string
}) {
  // A caller's colour must win, and Tailwind resolves conflicts by stylesheet
  // order rather than class order, so the default is dropped when one is given.
  const coloured = /(^|\s)text-(brand|ink|st-|on-)/.test(className ?? '')
  const classes = clsx(
    'font-mono text-[0.8125rem] font-medium whitespace-nowrap',
    !coloured && 'text-ink',
    className,
  )
  if (!to) return <span className={classes}>{children}</span>
  return (
    <Link to={to} className={clsx(classes, 'hover:text-brand hover:underline underline-offset-2')}>
      {children}
    </Link>
  )
}

/* ========================================================================== *
 * Pagination
 * ========================================================================== */

/** "orders" -> "order", "addresses" -> "address". Enough for our nouns. */
function singular(noun: string): string {
  if (noun.endsWith('sses')) return noun.slice(0, -2)
  if (noun.endsWith('s')) return noun.slice(0, -1)
  return noun
}

/**
 * The footer under every list.
 *
 * It states the range and the true total, because "1–25" alone tells an
 * operator nothing about whether there are 30 rows or 30,000. Page size is
 * adjustable on a desk; on a phone it collapses to a range and two arrows.
 */
export function Pagination({
  page,
  onPage,
  pageSize,
  onPageSize,
  noun = 'rows',
  busy = false,
}: {
  page: PageInfo<unknown>
  onPage: (next: number) => void
  pageSize: number
  onPageSize?: (next: number) => void
  /** Plural noun for the count, e.g. "orders". */
  noun?: string
  busy?: boolean
}) {
  const { from, to } = pageBounds(page)

  if (page.total === 0) return null

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 sm:px-5">
      <p className="min-w-0 truncate text-sm text-ink-dim tabular-nums">
        {page.total <= page.page_size ? (
          <>
            <span className="font-medium text-ink-soft">
              {page.total.toLocaleString('en-IN')}
            </span>{' '}
            {page.total === 1 ? singular(noun) : noun}
          </>
        ) : (
          <>
            <span className="font-medium text-ink-soft">
              {from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')}
            </span>{' '}
            of{' '}
            <span className="font-medium text-ink-soft">
              {page.total.toLocaleString('en-IN')}
            </span>
            <span className="hidden sm:inline"> {noun}</span>
          </>
        )}
        {busy && (
          <span className="ml-2 inline-block size-3 animate-spin rounded-full border-[1.5px] border-surface-3 border-t-brand align-[-1px]" />
        )}
      </p>

      <div className="flex shrink-0 items-center gap-3">
        {onPageSize && (
          <label className="hidden items-center gap-2 text-sm text-ink-dim md:flex">
            Rows
            <select
              value={pageSize}
              onChange={(event) => onPageSize(Number(event.target.value))}
              className={clsx(selectClass, 'h-8 w-auto py-0 pr-8 text-sm sm:h-8')}
            >
              {[25, 50, 100, 200].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        {page.pages > 1 && (
          <div className="flex items-center gap-1">
            <IconButton
              label="Previous page"
              variant="secondary"
              onClick={() => onPage(page.page - 1)}
              disabled={!page.has_previous}
              className="sm:size-8"
            >
              <IconChevronLeft size={16} />
            </IconButton>
            <span className="min-w-14 px-1 text-center text-sm text-ink-soft tabular-nums">
              {page.page} / {page.pages}
            </span>
            <IconButton
              label="Next page"
              variant="secondary"
              onClick={() => onPage(page.page + 1)}
              disabled={!page.has_next}
              className="sm:size-8"
            >
              <IconChevronRight size={16} />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  )
}

/* ========================================================================== *
 * Feedback
 * ========================================================================== */

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string
  hint?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-surface-2 text-ink-dim ring-1 ring-line">
        {icon ?? <IconInfo size={20} />}
      </span>
      <p className="text-base font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-dim">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/**
 * Loading placeholder. Shaped like the content it stands in for, so the page
 * does not jump when the data arrives.
 */
export function Spinner({ label, rows = 5 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3 p-4 sm:p-5" role="status" aria-label={label ?? 'Loading'}>
      <span className="sr-only">{label ?? 'Loading'}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-4 flex-1" style={{ opacity: 1 - index * 0.13 }} />
          <div className="skeleton hidden h-4 w-20 sm:block" />
        </div>
      ))}
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-4 flex items-start gap-3 rounded-xl bg-st-delayed/8 p-4 ring-1 ring-st-delayed/20">
      <IconAlert size={18} className="mt-0.5 text-st-delayed" />
      <div>
        <p className="text-sm font-medium text-st-delayed">{message}</p>
        {onRetry && (
          <Button size="sm" variant="secondary" className="mt-2.5" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}

/** Inline explanation or warning inside a panel or form. */
export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  children: ReactNode
}) {
  const Icon = tone === 'info' ? IconInfo : IconAlert
  return (
    <div
      className={clsx(
        'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-relaxed ring-1 ring-inset',
        tone === 'info' && 'bg-brand-tint/70 text-ink-soft ring-brand/15',
        tone === 'warning' && 'bg-st-assigned/8 text-[oklch(0.45_0.1_68)] ring-st-assigned/20',
        tone === 'danger' && 'bg-st-delayed/8 text-st-delayed ring-st-delayed/20',
        tone === 'success' && 'bg-st-available/8 text-st-available ring-st-available/20',
      )}
    >
      <Icon
        size={16}
        className={clsx(
          'mt-0.5',
          tone === 'info' && 'text-brand',
          tone === 'warning' && 'text-st-assigned',
        )}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/* ========================================================================== *
 * Dialogs and sheets
 * ========================================================================== */

/** Stop the page behind an overlay from scrolling, and close it on Escape. */
function useOverlay(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])
}

/**
 * A dialog on a desk, a bottom sheet on a phone.
 *
 * On a phone a centred dialog leaves its buttons at the top of the screen,
 * out of thumb reach, and fights the keyboard. Rising from the bottom keeps
 * the actions under the thumb and gives the form the full height.
 *
 * `placement="side"` turns it into a right-hand drawer from `lg` up, for
 * panels that sit beside the work rather than over it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-xl',
  placement = 'center',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
  placement?: 'center' | 'side'
}) {
  useOverlay(open, onClose)

  if (!open) return null

  const side = placement === 'side'

  return createPortal(
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-end justify-center',
        side ? 'lg:items-stretch lg:justify-end' : 'sm:items-center sm:p-6',
      )}
    >
      <div
        className="absolute inset-0 animate-fade-in bg-night/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          'relative z-10 flex max-h-[92dvh] w-full flex-col bg-surface-1 shadow-overlay',
          // Phone: a sheet rising from the bottom edge.
          'animate-sheet-up rounded-t-2xl',
          side
            ? 'lg:max-h-none lg:w-[30rem] lg:max-w-[92vw] lg:animate-slide-in-right lg:rounded-none lg:border-l lg:border-line'
            : clsx('sm:max-h-[86vh] sm:animate-pop sm:rounded-2xl sm:border sm:border-line', width),
        )}
      >
        {/* The grab handle tells a phone user this can be dismissed downward. */}
        <div className={clsx('flex justify-center pt-2.5', side ? 'lg:hidden' : 'sm:hidden')}>
          <span className="h-1 w-10 rounded-full bg-surface-3" />
        </div>
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pt-3 pb-4 sm:pt-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-ink-dim">{description}</p>
            )}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-2">
            <IconClose size={18} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          {children}
        </div>
        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-2/40 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] max-sm:*:flex-1">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * A bar pinned to the bottom of a phone screen for the page's main action.
 * Renders nothing from `lg` up unless `always` is set; the desk layout has
 * room for the action where it belongs.
 *
 * `offset` lifts it above the shell's own tab bar, which is shown below `lg`
 * in the control room and below `sm` in the customer portal.
 */
export function StickyActionBar({
  children,
  className,
  always = false,
  offset = 'lg',
}: {
  children: ReactNode
  className?: string
  always?: boolean
  offset?: 'lg' | 'sm' | 'none'
}) {
  return (
    <div
      className={clsx(
        'fixed inset-x-0 z-30 border-t border-line bg-surface-1/95 px-4 py-3 shadow-[0_-8px_24px_-12px_oklch(0.25_0.03_268/0.18)] backdrop-blur-md',
        offset === 'lg' &&
          'bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-0 lg:pb-3',
        offset === 'sm' &&
          'bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:bottom-0 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        offset === 'none' && 'bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        !always && 'lg:hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}
