import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtAgo } from '../lib/format'
import type { Customer } from '../lib/types'
import { phoneDigits } from '../components/customerPicker'
import { IconCustomers, IconPlus } from '../components/icons'
import { MetaItem, PageBody, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Avatar,
  Button,
  Callout,
  ChipBar,
  EmptyState,
  Field,
  FilterChip,
  ListCard,
  Modal,
  Pagination,
  Panel,
  Pill,
  ResponsiveList,
  SearchInput,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
  inputClass,
} from '../components/ui'

/** Whether the customer has used the portal yet -- the question the link answers. */
export function PortalStatus({ customer }: { customer: Customer }) {
  return customer.last_login_at ? (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
      <span className="size-1.5 rounded-full bg-st-available" />
      Uses the portal
      <span className="text-ink-dim">· {fmtAgo(customer.last_login_at)}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-dim">
      <span className="size-1.5 rounded-full bg-line-strong" />
      Not signed in yet
    </span>
  )
}

/**
 * Add a customer before they have ever used the portal. Their number is their
 * login: when they sign in with it they find everything raised for them.
 */
export function AddCustomerModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ phone: '', name: '', company: '', gst: '' })
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const digits = phoneDigits(form.phone)
  const existing = useQuery({
    queryKey: ['customer-lookup', digits],
    queryFn: () => api.customerByPhone(digits!),
    enabled: open && digits !== null,
  })

  const create = useMutation({
    mutationFn: () =>
      api.createCustomer({
        phone: form.phone,
        full_name: form.name.trim() || null,
        company: form.company.trim()
          ? { name: form.company.trim(), gst_number: form.gst.trim() || null }
          : null,
      }),
    onSuccess: (customer) => {
      toast.success(
        `${customer.full_name ?? customer.phone} added`,
        'They can sign in to the customer portal with this number.',
      )
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      onClose()
      navigate(`/customers/${customer.id}`)
    },
    onError: (error) => {
      const payload = (error as ApiError).payload as
        | { detail?: string | { message?: string } }
        | undefined
      const detail = payload?.detail
      toast.error(
        'Could not add the customer',
        typeof detail === 'string' ? detail : (detail?.message ?? (error as Error).message),
      )
    },
  })

  const ready = digits !== null && !existing.data && form.company.trim().length >= 2

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a customer"
      description="Their mobile number is their portal login. Everything you raise for them appears there."
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Adding…' : 'Add customer'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Mobile number">
          <input
            type="tel"
            inputMode="numeric"
            autoFocus
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
            placeholder="98765 43210"
            className={`${inputClass} font-mono`}
          />
        </Field>
        {existing.data && (
          <Callout tone="info">
            {existing.data.phone} is already{' '}
            <Link
              to={`/customers/${existing.data.id}`}
              onClick={onClose}
              className="font-semibold text-brand hover:underline"
            >
              {existing.data.full_name ?? 'a customer'}
            </Link>
            .
          </Callout>
        )}
        <Field label="Name" optional>
          <input
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="Hemant Sutaria"
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field label="Company to bill">
            <input
              value={form.company}
              onChange={(event) => set('company', event.target.value)}
              placeholder="Shakti Steel Works"
              className={inputClass}
            />
          </Field>
          <Field label="GSTIN" optional>
            <input
              value={form.gst}
              onChange={(event) => set('gst', event.target.value.toUpperCase())}
              className={`${inputClass} font-mono`}
            />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

export default function Customers() {
  const [search, setSearch] = useState('')
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [adding, setAdding] = useState(false)

  const list = usePaged({
    key: ['customers'],
    filters: {
      search: search.trim() || undefined,
      signed_in: signedIn ?? undefined,
    },
    fetchPage: (params) => api.customers(params),
    refetchInterval: 60_000,
  })

  const rows = list.items

  return (
    <PageBody>
      <PageHeader
        title="Customers"
        subtitle="Everyone who books with you — whether they signed up in the portal or you added them on the phone."
        meta={<MetaItem label="Matching">{list.page.total.toLocaleString('en-IN')}</MetaItem>}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <IconPlus size={17} />
            Add customer
          </Button>
        }
      />

      <Panel bodyClassName="overflow-visible">
        <div className="space-y-3 border-b border-line p-4 sm:px-5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, mobile, company or GSTIN"
            className="lg:max-w-md"
          />
          <ChipBar>
            <FilterChip active={signedIn === null} onClick={() => setSignedIn(null)}>
              Everyone
            </FilterChip>
            <FilterChip
              active={signedIn === true}
              onClick={() => setSignedIn(true)}
              dot="bg-st-available"
            >
              Using the portal
            </FilterChip>
            <FilterChip
              active={signedIn === false}
              onClick={() => setSignedIn(false)}
              dot="bg-line-strong"
            >
              Not signed in yet
            </FilterChip>
          </ChipBar>
        </div>

        {list.isInitialLoading ? (
          <Spinner label="Loading customers" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<IconCustomers size={20} />}
            title={search || signedIn !== null ? 'No customers match' : 'No customers yet'}
            hint={
              search || signedIn !== null
                ? 'Clear the search to see everyone.'
                : 'Customers appear when they sign up in the portal, or when you add one.'
            }
          />
        ) : (
          <>
            <ResponsiveList
              breakpoint="xl"
              cards={
                <ul className="divide-y divide-line">
                  {rows.map((customer) => (
                    <ListCard key={customer.id} to={`/customers/${customer.id}`}>
                      <div className="flex items-center gap-3">
                        <Avatar name={customer.full_name ?? customer.phone} size={38} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-ink">
                            {customer.full_name ?? 'Unnamed customer'}
                          </p>
                          <p className="truncate font-mono text-xs text-ink-dim">
                            {customer.phone}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums text-ink">
                            {customer.order_count}
                          </p>
                          <p className="text-xs text-ink-dim">orders</p>
                        </div>
                      </div>
                      <p className="mt-2.5 truncate text-sm text-ink-soft">
                        {customer.company_names.join(' · ') || 'No company yet'}
                      </p>
                      <div className="mt-1.5">
                        <PortalStatus customer={customer} />
                      </div>
                    </ListCard>
                  ))}
                </ul>
              }
              table={
                <Table
                  minWidth="56rem"
                  head={
                    <>
                      <Th>Customer</Th>
                      <Th>Companies</Th>
                      <Th align="right">Orders</Th>
                      <Th align="right">Open</Th>
                      <Th>Portal</Th>
                      <Th>Last order</Th>
                    </>
                  }
                >
                  {rows.map((customer) => (
                    <Tr key={customer.id} to={`/customers/${customer.id}`}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={customer.full_name ?? customer.phone} size={32} />
                          <div className="min-w-0">
                            <Link
                              to={`/customers/${customer.id}`}
                              className="block truncate font-medium text-ink hover:text-brand"
                            >
                              {customer.full_name ?? 'Unnamed customer'}
                            </Link>
                            <div className="truncate font-mono text-xs text-ink-dim">
                              {customer.phone}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td className="max-w-64">
                        <div className="flex flex-wrap gap-1">
                          {customer.company_names.slice(0, 2).map((name) => (
                            <Pill key={name}>{name}</Pill>
                          ))}
                          {customer.company_count > 2 && (
                            <Pill>+{customer.company_count - 2}</Pill>
                          )}
                          {customer.company_count === 0 && (
                            <span className="text-sm text-ink-dim">None yet</span>
                          )}
                        </div>
                      </Td>
                      <Td align="right" className="font-semibold tabular-nums">
                        {customer.order_count}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {customer.open_order_count > 0 ? (
                          <span className="font-medium text-st-transit">
                            {customer.open_order_count}
                          </span>
                        ) : (
                          <span className="text-ink-dim">0</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <PortalStatus customer={customer} />
                      </Td>
                      <Td className="text-sm whitespace-nowrap text-ink-soft">
                        {customer.last_order_at ? fmtAgo(customer.last_order_at) : '—'}
                      </Td>
                    </Tr>
                  ))}
                </Table>
              }
            />
            <Pagination
              page={list.page}
              onPage={list.setPage}
              pageSize={list.pageSize}
              onPageSize={list.setPageSize}
              noun="customers"
              busy={list.isPlaceholderData}
            />
          </>
        )}
      </Panel>

      {adding && <AddCustomerModal open={adding} onClose={() => setAdding(false)} />}
    </PageBody>
  )
}
