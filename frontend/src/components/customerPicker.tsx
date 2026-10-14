import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { CompanyAdmin } from '../lib/types'
import { IconBuilding, IconCheck, IconChevronLeft, IconPlus } from './icons'
import { Avatar, Button, Callout, Field, SearchInput, inputClass } from './ui'

/**
 * Who an order is billed to. Every order belongs to a customer through one of
 * their companies, so the customer sees it in their portal when they sign in
 * with their number -- whether they placed it or the control room did.
 *
 * Three ways to get there, resolved to a company id only when the order is
 * saved, so nothing is created if the operator cancels.
 */
export type BillTo =
  | { kind: 'company'; company: CompanyAdmin }
  | {
      kind: 'new-company'
      customerId: number
      customerName: string | null
      customerPhone: string
      name: string
    }
  | { kind: 'new-customer'; phone: string; name: string; company: string }

/** The ten digits that identify a customer, or null while still typing. */
export function phoneDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  const last10 = digits.length > 10 ? digits.slice(-10) : digits
  return last10.length === 10 ? last10 : null
}

export function billToComplete(value: BillTo | null): boolean {
  if (!value) return false
  if (value.kind === 'company') return true
  if (value.kind === 'new-company') return value.name.trim().length >= 2
  return phoneDigits(value.phone) !== null && value.company.trim().length >= 2
}

/** The customer whose address book the order form should offer first. */
export function billToCustomerId(value: BillTo | null): number | null {
  if (!value) return null
  if (value.kind === 'company') return value.company.customer_id
  if (value.kind === 'new-company') return value.customerId
  return null
}

/** Create whatever is new and return the company id to bill. */
export async function resolveBillTo(value: BillTo): Promise<number> {
  if (value.kind === 'company') return value.company.id
  if (value.kind === 'new-company') {
    const company = await api.addCustomerCompany(value.customerId, {
      name: value.name.trim(),
    })
    return company.id
  }
  const customer = await api.createCustomer({
    phone: value.phone,
    full_name: value.name.trim() || null,
    company: { name: value.company.trim() },
  })
  return customer.companies[0].id
}

/** One company as a choice: the company first, whose it is underneath. */
function CompanyChoice({
  company,
  active,
  onPick,
  showCustomer = true,
}: {
  company: CompanyAdmin
  active: boolean
  onPick: () => void
  showCustomer?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={clsx(
        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color]',
        active
          ? 'border-brand/50 bg-brand-tint ring-2 ring-brand/15'
          : 'border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2/60',
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft">
        <IconBuilding size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-semibold text-ink">
          {company.name}
        </span>
        <span className="block truncate text-xs text-ink-dim">
          {showCustomer ? (
            <>
              {company.customer_name ?? 'Customer'} ·{' '}
              <span className="font-mono">{company.customer_phone}</span>
            </>
          ) : (
            (company.gst_number ?? `${company.order_count} orders`)
          )}
        </span>
      </span>
      {active && <IconCheck size={18} className="shrink-0 text-brand" />}
    </button>
  )
}

/** A customer's own companies, plus a way to add one. */
function CustomerCompanies({
  customerId,
  value,
  onChange,
  onBack,
}: {
  customerId: number
  value: BillTo | null
  onChange: (next: BillTo | null) => void
  onBack: () => void
}) {
  const customer = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => api.customer(customerId),
  })
  const [adding, setAdding] = useState(value?.kind === 'new-company')
  const c = customer.data

  if (!c) return <p className="py-3 text-sm text-ink-dim">Loading the customer…</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl bg-surface-2/70 px-3.5 py-3 ring-1 ring-line ring-inset">
        <Avatar name={c.full_name ?? c.phone} size={36} tone="brand" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{c.full_name ?? 'Customer'}</p>
          <p className="truncate font-mono text-xs text-ink-dim">{c.phone}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 text-sm font-medium text-brand hover:underline"
        >
          Change
        </button>
      </div>

      <p className="text-sm font-medium text-ink">Which of their companies?</p>
      <button
        type="button"
        onClick={() => {
          setAdding(true)
          onChange({
            kind: 'new-company',
            customerId: c.id,
            customerName: c.full_name,
            customerPhone: c.phone,
            name: '',
          })
        }}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm font-semibold text-brand hover:border-brand/50 hover:bg-brand-tint"
      >
        <IconPlus size={15} />A new company for {c.full_name?.split(' ')[0] ?? 'them'}
      </button>
      {adding && value?.kind === 'new-company' && (
        <Field label="Company name" hint="Added to their account when the order is saved.">
          <input
            autoFocus
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            placeholder="Shakti Pipes Pvt Ltd"
            className={inputClass}
          />
        </Field>
      )}
      <div className="space-y-2">
        {c.companies.map((company) => (
          <CompanyChoice
            key={company.id}
            company={company}
            showCustomer={false}
            active={value?.kind === 'company' && value.company.id === company.id}
            onPick={() => {
              setAdding(false)
              onChange({ kind: 'company', company })
            }}
          />
        ))}
      </div>
    </div>
  )
}

/** A brand-new customer, typed while on the phone with them. */
function NewCustomer({
  value,
  onChange,
  onBack,
  onExisting,
}: {
  value: Extract<BillTo, { kind: 'new-customer' }>
  onChange: (next: BillTo | null) => void
  onBack: () => void
  onExisting: (customerId: number) => void
}) {
  const digits = phoneDigits(value.phone)

  // The number is the identity: if it is already on file, say so at once,
  // rather than letting the save fail.
  const existing = useQuery({
    queryKey: ['customer-lookup', digits],
    queryFn: () => api.customerByPhone(digits!),
    enabled: digits !== null,
  })

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm font-medium text-brand hover:bg-brand-tint"
      >
        <IconChevronLeft size={15} />
        Find an existing customer instead
      </button>

      <Field
        label="Customer's mobile number"
        hint="They sign in to the customer portal with this number and see this order."
      >
        <input
          type="tel"
          inputMode="numeric"
          autoFocus
          value={value.phone}
          onChange={(event) => onChange({ ...value, phone: event.target.value })}
          placeholder="98765 43210"
          className={clsx(inputClass, 'font-mono')}
        />
      </Field>

      {existing.data ? (
        <Callout tone="info">
          <span className="font-semibold text-ink">
            {existing.data.phone} is already {existing.data.full_name ?? 'a customer'}.
          </span>{' '}
          <button
            type="button"
            onClick={() => onExisting(existing.data!.id)}
            className="font-semibold text-brand hover:underline"
          >
            Use their account
          </button>
        </Callout>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Their name" optional>
            <input
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              placeholder="Hemant Sutaria"
              className={inputClass}
            />
          </Field>
          <Field label="Company to bill">
            <input
              value={value.company}
              onChange={(event) => onChange({ ...value, company: event.target.value })}
              placeholder="Shakti Steel Works"
              className={inputClass}
            />
          </Field>
        </div>
      )}
    </div>
  )
}

/**
 * Choose who the order is for. Search finds a customer by their name, their
 * number or any of their companies; "New customer" takes a number and a
 * company name and creates both when the order is saved.
 */
export function CustomerPicker({
  value,
  onChange,
  initialCustomerId,
}: {
  value: BillTo | null
  onChange: (next: BillTo | null) => void
  /** Open on this customer's companies, e.g. from their own page. */
  initialCustomerId?: number
}) {
  const [mode, setMode] = useState<'search' | 'customer' | 'new'>(
    initialCustomerId ? 'customer' : 'search',
  )
  const [customerId, setCustomerId] = useState<number | null>(initialCustomerId ?? null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (initialCustomerId) {
      setCustomerId(initialCustomerId)
      setMode('customer')
    }
  }, [initialCustomerId])

  const companies = useQuery({
    queryKey: ['companies', 'picker', search.trim()],
    queryFn: () => api.companies({ search: search.trim() || undefined, page_size: 6 }),
    enabled: mode === 'search',
  })

  if (mode === 'new' && value?.kind === 'new-customer') {
    return (
      <NewCustomer
        value={value}
        onChange={onChange}
        onBack={() => {
          onChange(null)
          setMode('search')
        }}
        onExisting={(id) => {
          onChange(null)
          setCustomerId(id)
          setMode('customer')
        }}
      />
    )
  }

  if (mode === 'customer' && customerId) {
    return (
      <CustomerCompanies
        customerId={customerId}
        value={value}
        onChange={onChange}
        onBack={() => {
          onChange(null)
          setCustomerId(null)
          setMode('search')
        }}
      />
    )
  }

  // A company is chosen: show it, with a way to change or pick a sibling.
  if (value?.kind === 'company') {
    const company = value.company
    return (
      <div className="flex items-center gap-3 rounded-xl border border-brand/40 bg-brand-tint/60 p-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-1 text-brand shadow-button">
          <IconBuilding size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{company.name}</p>
          <p className="truncate text-xs text-ink-soft">
            {company.customer_name ?? 'Customer'} ·{' '}
            <span className="font-mono">{company.customer_phone}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCustomerId(company.customer_id)
              setMode('customer')
            }}
          >
            Other company
          </Button>
          <Button size="sm" onClick={() => onChange(null)}>
            Change
          </Button>
        </div>
      </div>
    )
  }

  const results = companies.data?.items ?? []

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Customer name, mobile, company or GSTIN"
          className="flex-1"
        />
        <Button
          onClick={() => {
            setMode('new')
            onChange({ kind: 'new-customer', phone: phoneDigits(search) ?? '', name: '', company: '' })
          }}
          className="shrink-0"
        >
          <IconPlus size={16} />
          New customer
        </Button>
      </div>

      {companies.isLoading ? (
        <p className="py-2 text-sm text-ink-dim">Searching…</p>
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center">
          <p className="text-sm font-medium text-ink">No customer matches “{search}”.</p>
          <p className="mt-1 text-sm text-ink-dim">
            Add them as a new customer — it takes their number and a company name.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((company) => (
            <CompanyChoice
              key={company.id}
              company={company}
              active={false}
              onPick={() => onChange({ kind: 'company', company })}
            />
          ))}
          {(companies.data?.total ?? 0) > results.length && (
            <p className="px-1 text-xs text-ink-dim">
              {(companies.data!.total - results.length).toLocaleString('en-IN')} more — keep
              typing to narrow it down.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
