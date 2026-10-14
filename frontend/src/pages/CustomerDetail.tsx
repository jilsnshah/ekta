import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtAgo, fmtDate } from '../lib/format'
import type { CompanyAdmin, CustomerDetail as Customer } from '../lib/types'
import {
  IconBuilding,
  IconCustomers,
  IconEdit,
  IconOrders,
  IconPhone,
  IconPin,
  IconPlus,
} from '../components/icons'
import { NewOrderModal } from '../components/newOrderModal'
import { PageBody, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import { OrdersOnBoard } from '../components/tripList'
import {
  Avatar,
  Button,
  Callout,
  EmptyState,
  Field,
  IconButton,
  Modal,
  Pagination,
  Panel,
  Spinner,
  inputClass,
  textareaClass,
} from '../components/ui'

function errorText(error: unknown): string {
  const payload = (error as ApiError).payload as
    | { detail?: string | { message?: string } }
    | undefined
  const detail = payload?.detail
  return typeof detail === 'string' ? detail : (detail?.message ?? (error as Error).message)
}

/** Add a company to this customer, or correct one. */
function CompanyModal({
  customerId,
  company,
  onClose,
}: {
  customerId: number
  company: CompanyAdmin | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    name: company?.name ?? '',
    gst_number: company?.gst_number ?? '',
    contact_person: company?.contact_person ?? '',
    address: company?.address ?? '',
  })
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        gst_number: form.gst_number.trim() || null,
        contact_person: form.contact_person.trim() || null,
        address: form.address.trim() || null,
      }
      return company
        ? api.updateCompany(company.id, body)
        : api.addCustomerCompany(customerId, body)
    },
    onSuccess: (saved) => {
      toast.success(company ? `${saved.name} updated` : `${saved.name} added`)
      void queryClient.invalidateQueries({ queryKey: ['customer', customerId] })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      void queryClient.invalidateQueries({ queryKey: ['companies'] })
      onClose()
    },
    onError: (error) => toast.error('Could not save the company', errorText(error)),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={company ? `Edit ${company.name}` : 'Add a company'}
      description={
        company
          ? 'Orders already raised keep the name they were billed under.'
          : 'The customer sees it in their portal and can order against it.'
      }
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={form.name.trim().length < 2 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : company ? 'Save changes' : 'Add company'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Company name">
          <input
            autoFocus
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GSTIN" optional>
            <input
              value={form.gst_number}
              onChange={(event) => set('gst_number', event.target.value.toUpperCase())}
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label="Contact person" optional>
            <input
              value={form.contact_person}
              onChange={(event) => set('contact_person', event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Billing address" optional>
          <textarea
            rows={2}
            value={form.address}
            onChange={(event) => set('address', event.target.value)}
            className={textareaClass}
          />
        </Field>
      </div>
    </Modal>
  )
}

function EditNameModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(customer.full_name ?? '')
  const save = useMutation({
    mutationFn: () => api.updateCustomer(customer.id, { full_name: name.trim() || null }),
    onSuccess: () => {
      toast.success('Customer updated')
      void queryClient.invalidateQueries({ queryKey: ['customer', customer.id] })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      onClose()
    },
    onError: (error) => toast.error('Could not save', errorText(error)),
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit customer"
      description="Their mobile number is their login, so it cannot be changed here."
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
        />
      </Field>
    </Modal>
  )
}

export default function CustomerDetail() {
  const { id } = useParams()
  const customerId = Number(id)
  const [ordering, setOrdering] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [companyForm, setCompanyForm] = useState<CompanyAdmin | 'new' | null>(null)

  const customer = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => api.customer(customerId),
    enabled: Number.isFinite(customerId),
    refetchInterval: 60_000,
  })

  // Every order that belongs to them: billed to one of their companies, or
  // placed by them -- whoever typed it in.
  const orders = usePaged({
    key: ['orders', 'customer', customerId],
    filters: { customer_id: customerId, sort: 'created_at', descending: true },
    fetchPage: (params) => api.orders(params),
    pageSize: 10,
  })

  const places = usePaged({
    key: ['places', 'customer', customerId],
    filters: { account_id: customerId, only_account: true },
    fetchPage: (params) => api.places(params),
    pageSize: 8,
  })

  if (customer.isLoading)
    return (
      <PageBody>
        <Spinner label="Loading customer" />
      </PageBody>
    )
  if (!customer.data)
    return (
      <PageBody>
        <EmptyState icon={<IconCustomers size={20} />} title="Customer not found" />
      </PageBody>
    )

  const c = customer.data
  const name = c.full_name ?? 'Unnamed customer'

  return (
    <PageBody>
      <PageHeader
        back={{ to: '/customers', label: 'Customers' }}
        eyebrow="Customer"
        title={
          <>
            <Avatar name={c.full_name ?? c.phone} size={40} tone="brand" />
            {name}
            <IconButton label="Edit name" onClick={() => setEditingName(true)}>
              <IconEdit size={16} />
            </IconButton>
          </>
        }
        subtitle={
          <>
            <span className="font-mono">{c.phone}</span>
            {c.created_at && <> · customer since {fmtDate(c.created_at)}</>}
          </>
        }
        actions={
          <>
            <a
              href={`tel:${c.phone.replace(/\s/g, '')}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface-1 px-4 text-sm font-medium text-ink shadow-button transition-colors hover:border-line-strong sm:h-9 sm:px-3.5"
            >
              <IconPhone size={16} className="text-st-available" />
              Call
            </a>
            <Button variant="primary" onClick={() => setOrdering(true)}>
              <IconPlus size={17} />
              New order
            </Button>
          </>
        }
      />

      {/* What links the two sides, stated where the operator needs it. */}
      <div className="mb-4">
        {c.last_login_at ? (
          <Callout tone="success">
            <span className="font-semibold">Uses the customer portal</span> — last signed in{' '}
            {fmtAgo(c.last_login_at)}. Everything on this page is what they see there.
          </Callout>
        ) : (
          <Callout tone="info">
            <span className="font-semibold text-ink">Not signed in to the portal yet.</span>{' '}
            When they sign in with <span className="font-mono text-ink">{c.phone}</span>, they
            will find {c.order_count} {c.order_count === 1 ? 'order' : 'orders'},{' '}
            {c.company_count} {c.company_count === 1 ? 'company' : 'companies'} and{' '}
            {c.address_count} saved {c.address_count === 1 ? 'address' : 'addresses'} already
            there.
          </Callout>
        )}
      </div>

      <section className="card mb-4 grid grid-cols-2 gap-px overflow-hidden bg-line lg:grid-cols-4 [&>*]:bg-surface-1 [&>*]:px-4 [&>*]:py-4 sm:[&>*]:px-5">
        {[
          ['Orders', c.order_count],
          ['Open now', c.open_order_count],
          ['Companies', c.company_count],
          ['Saved addresses', c.address_count],
        ].map(([label, value]) => (
          <div key={label as string}>
            <p className="text-sm text-ink-dim">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          title="Orders"
          description="Raised in the portal or by the control room — the customer sees all of them"
          icon={<IconOrders size={18} />}
          bodyClassName=""
        >
          {orders.isInitialLoading ? (
            <Spinner rows={4} />
          ) : orders.items.length === 0 ? (
            <EmptyState
              icon={<IconOrders size={20} />}
              title="No orders yet"
              hint="Raise one for them and it appears in their portal straight away."
              action={
                <Button variant="primary" size="sm" onClick={() => setOrdering(true)}>
                  <IconPlus size={15} />
                  New order
                </Button>
              }
            />
          ) : (
            <OrdersOnBoard orders={orders.items} />
          )}
          {orders.items.length > 0 && (
            <Pagination
              page={orders.page}
              onPage={orders.setPage}
              pageSize={orders.pageSize}
              noun="orders"
              busy={orders.isPlaceholderData}
            />
          )}
        </Panel>

        <div className="space-y-4">
          <Panel
            title="Companies"
            description="Who their orders are billed to"
            bodyClassName=""
            actions={
              <Button size="sm" onClick={() => setCompanyForm('new')}>
                <IconPlus size={15} />
                Add
              </Button>
            }
          >
            {c.companies.length === 0 ? (
              <EmptyState
                icon={<IconBuilding size={20} />}
                title="No company yet"
                hint="Add one to raise orders for them."
              />
            ) : (
              <ul className="divide-y divide-line">
                {c.companies.map((company) => (
                  <li key={company.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft">
                      <IconBuilding size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/orders?billing_party=${encodeURIComponent(company.name)}`}
                        className="block truncate font-semibold text-ink hover:text-brand"
                      >
                        {company.name}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-ink-dim">
                        {[company.gst_number, company.contact_person].filter(Boolean).join(' · ') ||
                          'No GSTIN on file'}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-dim">
                        {company.order_count} {company.order_count === 1 ? 'order' : 'orders'}
                      </p>
                    </div>
                    <IconButton
                      label={`Edit ${company.name}`}
                      onClick={() => setCompanyForm(company)}
                      className="-mr-2"
                    >
                      <IconEdit size={16} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Saved addresses"
            description="Their own book, offered first on their orders"
            bodyClassName=""
          >
            {places.isInitialLoading ? (
              <Spinner rows={3} />
            ) : places.items.length === 0 ? (
              <EmptyState
                icon={<IconPin size={20} />}
                title="None saved yet"
                hint="Addresses save themselves the first time an order uses them."
              />
            ) : (
              <ul className="divide-y divide-line">
                {places.items.map((place) => (
                  <li key={place.id} className="px-4 py-3 sm:px-5">
                    <p className="text-sm font-semibold text-ink">{place.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                      {place.address}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-dim">
                      {place.phone && <span className="font-mono">{place.phone} · </span>}
                      used {place.use_count}×
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {places.items.length > 0 && (
              <Pagination
                page={places.page}
                onPage={places.setPage}
                pageSize={places.pageSize}
                noun="addresses"
                busy={places.isPlaceholderData}
              />
            )}
          </Panel>
        </div>
      </div>

      {ordering && (
        <NewOrderModal open onClose={() => setOrdering(false)} customerId={c.id} />
      )}
      {editingName && <EditNameModal customer={c} onClose={() => setEditingName(false)} />}
      {companyForm && (
        <CompanyModal
          customerId={c.id}
          company={companyForm === 'new' ? null : companyForm}
          onClose={() => setCompanyForm(null)}
        />
      )}
    </PageBody>
  )
}
