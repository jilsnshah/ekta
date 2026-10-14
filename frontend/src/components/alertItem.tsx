import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { fmtAgo, fmtDateTime } from '../lib/format'
import { alertTarget } from '../lib/links'
import type { Alert } from '../lib/types'
import { IconAlert, IconCheck, IconInfo } from './icons'
import { Button, useRowLink } from './ui'

const TONE: Record<string, { ring: string; icon: typeof IconAlert; label: string }> = {
  critical: { ring: 'bg-st-delayed/10 text-st-delayed', icon: IconAlert, label: 'Critical' },
  warning: { ring: 'bg-st-assigned/12 text-st-assigned', icon: IconAlert, label: 'Warning' },
  info: { ring: 'bg-st-transit/10 text-st-transit', icon: IconInfo, label: 'Info' },
}

/**
 * One alert, shared by the overview rail and the alerts page so both read
 * identically. The whole row opens whatever the alert is about; the related
 * links and the acknowledge button keep their own behaviour.
 *
 * Severity is carried by the glyph's colour and stated in words beside the
 * time, rather than by a pill that competed with the title for attention.
 */
export function AlertItem({
  alert,
  onAcknowledge,
  acknowledging = false,
  compact = false,
}: {
  alert: Alert
  onAcknowledge?: () => void
  acknowledging?: boolean
  compact?: boolean
}) {
  const target = alertTarget(alert)
  const rowLink = useRowLink(target)
  const tone = TONE[alert.severity] ?? TONE.info
  const Icon = alert.acknowledged ? IconCheck : tone.icon

  const related = 'font-mono text-xs font-medium text-ink-soft hover:text-brand hover:underline'

  return (
    <li
      {...rowLink}
      className={clsx(
        'flex items-start gap-3.5 px-4 transition-colors sm:px-5',
        compact ? 'py-3' : 'py-4',
        target && 'hover:bg-brand-tint/40',
        rowLink.className,
        alert.acknowledged && 'opacity-60',
      )}
    >
      <span
        className={clsx(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
          alert.acknowledged ? 'bg-surface-2 text-ink-dim' : tone.ring,
        )}
      >
        <Icon size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug font-semibold text-ink">{alert.title}</p>
        <p
          className={clsx(
            'mt-1 leading-relaxed text-ink-soft',
            compact ? 'line-clamp-2 text-xs' : 'text-sm',
          )}
        >
          {alert.message}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span
            className={clsx(
              'font-medium',
              alert.severity === 'critical' ? 'text-st-delayed' : 'text-ink-dim',
            )}
          >
            {tone.label}
          </span>
          <span className="text-ink-dim" title={fmtDateTime(alert.created_at)}>
            {fmtAgo(alert.created_at)}
          </span>
          {alert.order_code && alert.order_id && (
            <Link to={`/orders/${alert.order_id}`} className={related}>
              {alert.order_code}
            </Link>
          )}
          {alert.truck_registration && alert.truck_id && (
            <Link to={`/trucks/${alert.truck_id}`} className={related}>
              {alert.truck_registration}
            </Link>
          )}
          {alert.trip_id && (
            <Link to={`/trips/${alert.trip_id}`} className={clsx(related, 'font-sans')}>
              View trip
            </Link>
          )}
        </div>
      </div>

      {onAcknowledge && !alert.acknowledged && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onAcknowledge}
          disabled={acknowledging}
          className="shrink-0"
        >
          <IconCheck size={15} />
          <span className="max-sm:sr-only">Acknowledge</span>
        </Button>
      )}
    </li>
  )
}
