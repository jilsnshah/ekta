import clsx from 'clsx'
import { useEffect, type ReactNode } from 'react'
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

/* ========================================================================== *
 * Badges
 * ========================================================================== */

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
        'inline-flex shrink-0 items-center gap-1.5 rounded-md border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-[3px] text-sm',
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
        'inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs font-semibold',
        meta.chip,
      )}
    >
      {meta.label}
    </span>
  )
}

/** Neutral count / metadata pill. No semantic colour. */
export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-ink-soft">
      {children}
    </span>
  )
}

/* ========================================================================== *
 * Capacity and progress
 * ========================================================================== */

/**
 * The load visual used wherever capacity matters. Reads as "14 / 20 T" with
 * the free headroom beside it and a bar that warns as it fills.
 */
export function CapacityBar({
  capacity,
  size = 'md',
  pendingTons = 0,
}: {
  capacity: Capacity
  size?: 'sm' | 'md'
  /** Tons being staged for assignment, drawn as a hatched overlay. */
  pendingTons?: number
}) {
  const total = capacity.capacity_tons || 1
  const usedPct = Math.min((capacity.current_load_tons / total) * 100, 100)
  const pendingPct = Math.min((pendingTons / total) * 100, 100 - usedPct)
  const overflow = Math.max(capacity.current_load_tons + pendingTons - total, 0)
  const tone = loadTone(((capacity.current_load_tons + pendingTons) / total) * 100)
  const free = Math.max(capacity.available_tons - pendingTons, 0)

  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
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
        className="relative h-1.5 overflow-hidden rounded-full bg-surface-3"
        role="meter"
        aria-valuenow={Math.round(capacity.current_load_tons + pendingTons)}
        aria-valuemin={0}
        aria-valuemax={capacity.capacity_tons}
        aria-label="Truck load"
      >
        <div
          className={clsx('absolute inset-y-0 left-0 rounded-full transition-all', tone.bar)}
          style={{ width: `${usedPct}%` }}
        />
        {pendingPct > 0 && (
          <div
            className="absolute inset-y-0 rounded-full bg-brand"
            style={{
              left: `${usedPct}%`,
              width: `${pendingPct}%`,
              backgroundImage:
                'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.45) 0 3px, transparent 3px 6px)',
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
    <div className="w-full space-y-1">
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
          className={clsx('h-full rounded-full transition-all duration-300', bar)}
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
 * calm and the one that needs attention stands out.
 */
export function KpiTile({
  label,
  value,
  sub,
  tone,
  to,
  onClick,
  active = false,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: string
  /** Navigate to a page. Use for figures whose detail lives elsewhere. */
  to?: string
  /** Filter in place. Use for figures the table below can narrow to. */
  onClick?: () => void
  active?: boolean
}) {
  const body = (
    <>
      <span className="label">{label}</span>
      <span className={clsx('text-2xl font-semibold tabular-nums', tone ?? 'text-ink')}>
        {value}
      </span>
      {sub && <span className="text-xs text-ink-dim">{sub}</span>}
    </>
  )

  const shell =
    'card flex flex-col gap-1 px-4 py-3.5 text-left transition-colors'
  const hover = 'cursor-pointer hover:border-line-strong hover:bg-surface-2/60'

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
          active && 'border-brand bg-brand-tint hover:bg-brand-tint',
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
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={clsx('card flex min-h-0 flex-col overflow-hidden', className)}>
      {(title || actions) && (
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
            {description && (
              <p className="mt-0.5 truncate text-xs text-ink-dim">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx('min-h-0 flex-1', bodyClassName ?? 'overflow-auto')}>{children}</div>
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
      <div
        className={clsx(
          'mt-0.5 text-sm text-ink',
          mono && 'font-mono tabular-nums',
        )}
      >
        {value}
      </div>
    </div>
  )
}

/* ========================================================================== *
 * Controls
 * ========================================================================== */

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-50'

// Comfortable to tap on a phone, unchanged on a pointer device from sm up.
const BUTTON_SIZE = {
  sm: 'h-8 px-2.5 text-sm',
  md: 'h-10 px-3.5 text-sm sm:h-9',
}

const BUTTON_VARIANT = {
  primary: 'border-brand bg-brand text-on-brand hover:bg-brand-hover hover:border-brand-hover',
  secondary: 'border-line bg-surface-1 text-ink hover:bg-surface-2',
  ghost: 'border-transparent bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink',
  danger: 'border-st-delayed/30 bg-surface-1 text-st-delayed hover:bg-st-delayed/10',
}

export type ButtonVariant = keyof typeof BUTTON_VARIANT

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
}) {
  return (
    <button
      {...rest}
      className={clsx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className)}
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
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <Link
      to={to}
      className={clsx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className)}
    >
      {children}
    </Link>
  )
}

export const inputClass =
  'h-11 w-full rounded-md border border-line bg-surface-1 px-3 text-base text-ink sm:h-9 sm:text-sm ' +
  'transition-colors placeholder:text-ink-dim ' +
  'focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none ' +
  'disabled:bg-surface-2 disabled:text-ink-dim'

export const textareaClass =
  'w-full rounded-md border border-line bg-surface-1 px-3 py-2 text-base text-ink sm:text-sm ' +
  'transition-colors placeholder:text-ink-dim ' +
  'focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none'

/** Native select, restyled to match the inputs. */
export const selectClass =
  'h-11 w-full appearance-none rounded-md border border-line bg-surface-1 pr-8 pl-3 text-base text-ink sm:h-9 sm:text-sm ' +
  'transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none ' +
  "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%23737a89%22><path d=%22M5.5 7.5 10 12l4.5-4.5z%22/></svg>')] " +
  'bg-[length:1.1rem] bg-[position:right_0.4rem_center] bg-no-repeat'

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-st-delayed">{error}</span>
      ) : (
        hint && <span className="text-xs text-ink-dim">{hint}</span>
      )}
    </label>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={clsx('relative', className)}>
      <svg
        viewBox="0 0 20 20"
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-dim"
      >
        <path
          fill="currentColor"
          d="M8.5 3a5.5 5.5 0 0 1 4.23 9.02l3.63 3.62a.75.75 0 0 1-1.06 1.06l-3.62-3.62A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
        />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={clsx(inputClass, 'pl-8')}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded text-ink-dim hover:bg-surface-2 hover:text-ink"
        >
          ×
        </button>
      )}
    </div>
  )
}

/** Segmented filter chip, used for every status / quick filter row. */
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
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors sm:h-7 sm:px-2',
        active
          ? 'border-brand bg-brand-tint text-brand'
          : 'border-line bg-surface-1 text-ink-soft hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {dot && <span className={clsx('size-1.5 rounded-full', dot)} />}
      {children}
      {count !== undefined && (
        <span
          className={clsx(
            'tabular-nums',
            active ? 'text-brand/70' : 'text-ink-dim',
          )}
        >
          {count}
        </span>
      )}
    </button>
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
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr className="border-b border-line">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
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
        'label px-4 py-2.5 font-semibold',
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
        'border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/70',
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
        'px-4 py-3 align-middle text-sm',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </td>
  )
}

/**
 * Renders `cards` on a phone and `table` from md up.
 *
 * A dense table cannot be made comfortable on a 390px screen -- it either
 * scrolls sideways or shrinks past readability -- so screens that have both
 * audiences supply two presentations of the same rows.
 */
export function ResponsiveList({
  cards,
  table,
}: {
  cards: ReactNode
  table: ReactNode
}) {
  return (
    <>
      <div className="md:hidden">{cards}</div>
      <div className="hidden md:block">{table}</div>
    </>
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
      {secondary && <div className="truncate text-xs text-ink-dim">{secondary}</div>}
    </div>
  )
}

/* ========================================================================== *
 * Pagination
 * ========================================================================== */

/**
 * The footer under every list.
 *
 * It states the range and the true total, because "1–25" alone tells an
 * operator nothing about whether there are 30 rows or 30,000. Page size is
 * adjustable, since what fits a phone and a desk monitor differ.
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <p className="text-sm text-ink-soft tabular-nums">
        {page.total <= page.page_size ? (
          <>
            {page.total.toLocaleString('en-IN')} {noun}
          </>
        ) : (
          <>
            Showing{' '}
            <span className="font-medium text-ink">
              {from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')}
            </span>{' '}
            of <span className="font-medium text-ink">
              {page.total.toLocaleString('en-IN')}
            </span>{' '}
            {noun}
          </>
        )}
        {busy && <span className="ml-2 text-ink-dim">updating…</span>}
      </p>

      <div className="flex items-center gap-2">
        {onPageSize && (
          <label className="hidden items-center gap-2 text-sm text-ink-dim sm:flex">
            Per page
            <select
              value={pageSize}
              onChange={(event) => onPageSize(Number(event.target.value))}
              className={clsx(selectClass, 'h-8 w-auto py-0 text-sm')}
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
            <Button
              size="sm"
              onClick={() => onPage(page.page - 1)}
              disabled={!page.has_previous}
            >
              Previous
            </Button>
            <span className="px-2 text-sm text-ink-soft tabular-nums">
              {page.page} / {page.pages}
            </span>
            <Button
              size="sm"
              onClick={() => onPage(page.page + 1)}
              disabled={!page.has_next}
            >
              Next
            </Button>
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
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex h-full min-h-44 flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-dim">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex h-full min-h-44 items-center justify-center gap-2.5 p-10 text-sm text-ink-dim">
      <span className="size-4 animate-spin rounded-full border-2 border-surface-3 border-t-brand" />
      {label ?? 'Loading'}
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-4 rounded-md border border-st-delayed/25 bg-st-delayed/8 p-4">
      <p className="text-sm font-medium text-st-delayed">{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" className="mt-2.5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** Inline explanation or warning inside a panel or form. */
export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger'
  children: ReactNode
}) {
  return (
    <div
      className={clsx(
        'rounded-md border px-3 py-2 text-sm',
        tone === 'info' && 'border-brand/20 bg-brand-tint text-ink-soft',
        tone === 'warning' && 'border-st-assigned/25 bg-st-assigned/8 text-st-assigned',
        tone === 'danger' && 'border-st-delayed/25 bg-st-delayed/8 text-st-delayed',
      )}
    >
      {children}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-xl',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // Stop the page behind the dialog from scrolling.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/25 p-4 backdrop-blur-[1px] sm:items-center sm:p-6">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          'relative z-10 my-auto w-full rounded-xl border border-line bg-surface-1',
          'shadow-[0_16px_48px_-12px_rgb(15_23_42/0.25)]',
          width,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-dim">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 grid size-7 shrink-0 place-items-center rounded-md text-lg leading-none text-ink-dim hover:bg-surface-2 hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="max-h-[68vh] overflow-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
