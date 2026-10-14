import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { fmtAgo, fmtDateTime } from '../lib/format'
import { alertTarget } from '../lib/links'
import type { Alert } from '../lib/types'
import { Button, SeverityBadge, useRowLink } from './ui'

/**
 * One alert, shared by the dashboard rail and the alerts page so both read
 * identically. The whole row opens whatever the alert is about; the related
 * links and the acknowledge button keep their own behaviour.
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

  return (
    <li
      {...rowLink}
      className={clsx(
        'flex items-start gap-4 px-4 transition-colors',
        compact ? 'py-3' : 'py-3.5',
        target && 'hover:bg-surface-2/70',
        rowLink.className,
        alert.acknowledged && 'opacity-55',
      )}
    >
      <div className="mt-0.5 shrink-0">
        <SeverityBadge severity={alert.severity} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{alert.title}</p>
        <p
          className={clsx(
            'mt-0.5 leading-relaxed text-ink-soft',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {alert.message}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-ink-dim" title={fmtDateTime(alert.created_at)}>
            {fmtAgo(alert.created_at)}
          </span>
          {alert.order_code && alert.order_id && (
            <Link
              to={`/orders/${alert.order_id}`}
              className="font-medium text-brand hover:underline"
            >
              {alert.order_code}
            </Link>
          )}
          {alert.truck_registration && alert.truck_id && (
            <Link
              to={`/trucks/${alert.truck_id}`}
              className="font-medium text-brand hover:underline"
            >
              {alert.truck_registration}
            </Link>
          )}
          {alert.trip_id && (
            <Link
              to={`/trips/${alert.trip_id}`}
              className="font-medium text-brand hover:underline"
            >
              Trip
            </Link>
          )}
        </div>
      </div>

      {onAcknowledge && !alert.acknowledged && (
        <Button size="sm" variant="ghost" onClick={onAcknowledge} disabled={acknowledging}>
          Acknowledge
        </Button>
      )}
    </li>
  )
}
