/** Backend datetimes are naive UTC strings; append Z so parsing is correct. */
export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null
  const normalised = /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`
  const date = new Date(normalised)
  return Number.isNaN(date.getTime()) ? null : date
}

const timeFmt = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function fmtTime(value: string | null | undefined): string {
  const date = parseUtc(value)
  return date ? timeFmt.format(date) : '--'
}

export function fmtDateTime(value: string | null | undefined): string {
  const date = parseUtc(value)
  return date ? dateTimeFmt.format(date) : '--'
}

export function fmtDate(value: string | null | undefined): string {
  const date = parseUtc(value)
  return date ? dateFmt.format(date) : '--'
}

export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '--'
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export function fmtAgo(value: string | null | undefined): string {
  const date = parseUtc(value)
  if (!date) return 'never'
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000)
  if (diffMinutes < 1) return 'just now'
  return `${fmtDuration(diffMinutes)} ago`
}

export function fmtTons(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--'
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}T`
}

export function fmtKm(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--'
  return `${Math.round(value).toLocaleString('en-IN')} km`
}

export function fmtMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--'
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

export function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--'
  return value.toLocaleString('en-IN')
}

export function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * A pickup date is a plain "YYYY-MM-DD", so it is compared by day in local
 * time rather than parsed as a UTC instant.
 */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

const dayFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

/** "12 Oct 2026" */
export function fmtDay(value: string | null | undefined): string {
  const date = parseDay(value)
  return date ? dayFmt.format(date) : '--'
}

/** Whole days between today and a pickup date, negative when past. */
export function daysUntil(value: string | null | undefined): number | null {
  const date = parseDay(value)
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((date.getTime() - today.getTime()) / 86_400_000)
}

/** "Today", "Tomorrow", "in 3 days", "2 days ago". */
export function fmtDayRelative(value: string | null | undefined): string {
  const days = daysUntil(value)
  if (days === null) return '--'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 0) return `in ${days} days`
  return `${-days} days ago`
}

/** How urgent a pickup is, for colouring. */
export function pickupRisk(pickupDate: string): 'overdue' | 'soon' | 'ok' {
  const days = daysUntil(pickupDate)
  if (days === null) return 'ok'
  if (days < 0) return 'overdue'
  if (days <= 1) return 'soon'
  return 'ok'
}
