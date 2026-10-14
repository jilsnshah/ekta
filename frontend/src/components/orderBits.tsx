import clsx from 'clsx'
import type { ReactNode } from 'react'
import { fmtDayRelative, pickupRisk } from '../lib/format'

/** A titled block inside a long form, so it reads as three questions, not twenty fields. */
export function FormSection({
  title,
  icon,
  children,
}: {
  title: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        {icon && (
          <span className="grid size-7 place-items-center rounded-lg bg-surface-2 text-ink-soft">
            {icon}
          </span>
        )}
        {title}
      </h3>
      {children}
    </section>
  )
}

/** "Today", "In 3 days", "2 days ago" -- coloured when a pickup is late or close. */
export function PickupWhen({ date, className }: { date: string; className?: string }) {
  const risk = pickupRisk(date)
  return (
    <span
      className={clsx(
        risk === 'overdue'
          ? 'font-semibold text-st-delayed'
          : risk === 'soon'
            ? 'font-medium text-st-pickup'
            : 'text-ink',
        className,
      )}
    >
      {fmtDayRelative(date)}
    </span>
  )
}

/** Pickup and drop as two stops on a tiny line. */
export function Route({ from, to }: { from: string; to: string }) {
  return (
    <div className="relative min-w-0 pl-4">
      <span className="absolute top-[9px] bottom-[9px] left-[3px] w-px bg-line-strong" />
      <span className="absolute top-[6px] left-0 size-[7px] rounded-full bg-st-pickup" />
      <span className="absolute bottom-[6px] left-0 size-[7px] rounded-full bg-st-delivery" />
      <div className="truncate text-sm text-ink">{from}</div>
      <div className="mt-1 truncate text-sm text-ink">{to}</div>
    </div>
  )
}

/**
 * An order's progress as a row of milestones. Horizontal from `sm` up, where
 * it reads left to right like the journey itself; stacked on a phone.
 */
export function Milestones({
  steps,
}: {
  steps: Array<{ label: string; at: string | null; detail?: string }>
}) {
  const reached = steps.filter((step) => step.at).length
  return (
    <ol className="grid gap-0 sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ ['--n' as string]: steps.length }}>
      {steps.map((step, index) => {
        const done = Boolean(step.at)
        const current = index === reached
        const last = index === steps.length - 1
        return (
          <li key={step.label} className="relative flex gap-3 pb-5 last:pb-0 sm:block sm:pr-4 sm:pb-0">
            {/* connector */}
            {!last && (
              <span
                aria-hidden
                className={clsx(
                  'absolute top-6 bottom-0 left-[11px] w-0.5 sm:top-[11px] sm:right-0 sm:bottom-auto sm:left-7 sm:h-0.5 sm:w-auto',
                  index < reached - 1 || (done && steps[index + 1]?.at)
                    ? 'bg-st-available'
                    : 'bg-line',
                )}
              />
            )}
            <span
              className={clsx(
                'relative z-10 grid size-6 shrink-0 place-items-center rounded-full',
                done
                  ? 'bg-st-available text-white'
                  : current
                    ? 'bg-surface-1 ring-2 ring-brand'
                    : 'bg-surface-1 ring-2 ring-line',
              )}
            >
              {done ? (
                <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden>
                  <path d="m5 10.5 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : current ? (
                <span className="size-2 rounded-full bg-brand" />
              ) : null}
            </span>
            <div className="min-w-0 sm:mt-3">
              <p className={clsx('text-sm', done || current ? 'font-semibold text-ink' : 'text-ink-dim')}>
                {step.label}
              </p>
              <p className="mt-0.5 text-xs text-ink-dim">
                {step.detail ?? (done ? step.at : current ? 'Next' : 'Pending')}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** A pickup or drop point: who, where, and a one-tap call. */
export function PlaceBlock({
  kind,
  name,
  phone,
  address,
}: {
  kind: 'pickup' | 'drop'
  name: string
  phone: string | null
  address: string
}) {
  return (
    <div className="min-w-0 flex-1">
      <p
        className={clsx(
          'flex items-center gap-1.5 text-xs font-semibold',
          kind === 'pickup' ? 'text-st-pickup' : 'text-st-delivery',
        )}
      >
        <span
          className={clsx(
            'size-2 rounded-full',
            kind === 'pickup' ? 'bg-st-pickup' : 'bg-st-delivery',
          )}
        />
        {kind === 'pickup' ? 'Pick up from' : 'Deliver to'}
      </p>
      <p className="mt-2 text-base font-semibold text-ink">{name}</p>
      <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{address}</p>
      {phone ? (
        <a
          href={`tel:${phone.replace(/\s/g, '')}`}
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-1 px-3 font-mono text-sm text-ink shadow-button transition-colors hover:border-brand/40 hover:text-brand"
        >
          <svg viewBox="0 0 20 20" className="size-4 text-ink-dim" aria-hidden>
            <path
              d="M4.25 3h2.5l1.5 3.75-1.9 1.15a8.5 8.5 0 0 0 3.75 3.75l1.15-1.9L15 11.25v2.5A1.75 1.75 0 0 1 13.25 15.5 10.25 10.25 0 0 1 2.5 4.75 1.75 1.75 0 0 1 4.25 3Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          {phone}
        </a>
      ) : (
        <p className="mt-3 text-sm text-ink-dim">No phone number on file</p>
      )}
    </div>
  )
}
