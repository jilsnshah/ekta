import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Company } from '../../lib/types'
import { PortalPageHeader } from '../../components/portalShell'
import { useToast } from '../../components/toast'
import {
  Button,
  Callout,
  EmptyState,
  Field,
  LinkButton,
  Modal,
  Panel,
  Spinner,
  inputClass,
  textareaClass,
} from '../../components/ui'

function CompanyForm({
  open,
  onClose,
  company,
}: {
  open: boolean
  onClose: () => void
  company?: Company | null
}) {
  const editing = Boolean(company)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { refreshParty } = useAuth()

  const [form, setForm] = useState(() => ({
    name: company?.name ?? '',
    gst_number: company?.gst_number ?? '',
    contact_person: company?.contact_person ?? '',
    address: company?.address ?? '',
  }))

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        gst_number: form.gst_number.trim() || null,
        contact_person: form.contact_person.trim() || null,
        address: form.address.trim() || null,
      }
      const saved =
        editing && company
          ? await api.portal.updateCompany(company.id, body)
          : await api.portal.createCompany(body)
      // Keep the cached company count honest, since the order form depends
      // on whether any company exists.
      refreshParty(await api.portal.me())
      return saved
    },
    onSuccess: (saved) => {
      toast.success(editing ? `${saved.name} updated` : `${saved.name} added`)
      void queryClient.invalidateQueries({ queryKey: ['portal-companies'] })
      void queryClient.invalidateQueries({ queryKey: ['portal-summary'] })
      onClose()
    },
    onError: (error) =>
      toast.error('Could not save the company', (error as ApiError).message),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${company?.name}` : 'Add a company'}
      description="You will pick one of these when placing an order."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={form.name.trim().length < 2 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add company'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" className="sm:col-span-2">
          <input
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="ABC Industries"
            className={inputClass}
          />
        </Field>
        <Field label="GSTIN" hint="Optional.">
          <input
            value={form.gst_number}
            onChange={(event) => set('gst_number', event.target.value)}
            className={`${inputClass} font-mono uppercase`}
          />
        </Field>
        <Field label="Contact person" hint="Optional.">
          <input
            value={form.contact_person}
            onChange={(event) => set('contact_person', event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Registered address" hint="Optional." className="sm:col-span-2">
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

export default function PortalCompanies() {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { refreshParty } = useAuth()

  const companies = useQuery({
    queryKey: ['portal-companies'],
    queryFn: () => api.portal.companies(),
  })

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.portal.deleteCompany(id)
      refreshParty(await api.portal.me())
    },
    onSuccess: () => {
      toast.success('Company removed')
      void queryClient.invalidateQueries({ queryKey: ['portal-companies'] })
      void queryClient.invalidateQueries({ queryKey: ['portal-summary'] })
    },
    onError: (error) => toast.error('Could not remove', (error as ApiError).message),
  })

  const list = companies.data ?? []

  return (
    <>
      <PortalPageHeader
        title="My companies"
        subtitle="The names your orders can be billed to."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add company
          </Button>
        }
      />

      {!companies.isLoading && list.length === 0 && (
        <div className="mb-4">
          <Callout tone="info">
            Add a company and you are ready to place orders.
          </Callout>
        </div>
      )}

      {companies.isLoading ? (
        <Spinner label="Loading companies" />
      ) : list.length === 0 ? (
        <Panel>
          <EmptyState
            title="No companies yet"
            hint="This is the name your bill will be in."
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add company
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((company) => (
            <div key={company.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-ink">
                    {company.name}
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-dim">
                    {company.order_count === 0
                      ? 'No orders yet'
                      : `${company.order_count} order${company.order_count > 1 ? 's' : ''} placed`}
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                {company.gst_number && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 text-ink-dim">GSTIN</dt>
                    <dd className="font-mono">{company.gst_number}</dd>
                  </div>
                )}
                {company.contact_person && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 text-ink-dim">Contact</dt>
                    <dd>{company.contact_person}</dd>
                  </div>
                )}
                {company.address && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 text-ink-dim">Address</dt>
                    <dd className="text-ink-soft">{company.address}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-4 flex gap-2 border-t border-line pt-4">
                <LinkButton to="/portal/new" size="sm" variant="primary">
                  Place an order
                </LinkButton>
                <Button size="sm" onClick={() => setEditing(company)}>
                  Edit
                </Button>
                {company.order_count === 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(company.id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && <CompanyForm open={adding} onClose={() => setAdding(false)} />}
      {editing && (
        <CompanyForm open onClose={() => setEditing(null)} company={editing} />
      )}
    </>
  )
}
