import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '../../lib/api'
import { usePaged } from '../../lib/usePaged'
import type { SavedPlace } from '../../lib/types'
import { PortalPageHeader } from '../../components/portalShell'
import { useToast } from '../../components/toast'
import {
  Button,
  Callout,
  EmptyState,
  Field,
  Modal,
  Pagination,
  Panel,
  SearchInput,
  Spinner,
  inputClass,
  textareaClass,
} from '../../components/ui'

function AddressForm({
  open,
  onClose,
  place,
}: {
  open: boolean
  onClose: () => void
  place?: SavedPlace | null
}) {
  const editing = Boolean(place)
  const queryClient = useQueryClient()
  const toast = useToast()

  const [form, setForm] = useState(() => ({
    label: place?.label ?? '',
    phone: place?.phone ?? '',
    address: place?.address ?? '',
  }))

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const save = useMutation({
    mutationFn: () => {
      const body = {
        label: form.label.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim(),
      }
      return editing && place
        ? api.portal.updatePlace(place.id, body)
        : api.portal.createPlace(body)
    },
    onSuccess: (saved) => {
      toast.success(editing ? `${saved.label} updated` : `${saved.label} saved`)
      void queryClient.invalidateQueries({ queryKey: ['portal-places'] })
      onClose()
    },
    onError: (error) => toast.error('Could not save it', (error as ApiError).message),
  })

  const ready = form.label.trim().length >= 2 && form.address.trim().length >= 3

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${place?.label}` : 'Save an address'}
      description="You will be able to pick this when placing an order."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Save address'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name of the place" hint="Something you will recognise.">
          <input
            value={form.label}
            onChange={(event) => set('label', event.target.value)}
            placeholder="Naroda Godown"
            className={inputClass}
          />
        </Field>
        <Field label="Full address">
          <textarea
            rows={3}
            value={form.address}
            onChange={(event) => set('address', event.target.value)}
            placeholder="Block C, Naroda GIDC, Ahmedabad - 382330"
            className={textareaClass}
          />
        </Field>
        <Field
          label="Phone number at this place"
          hint="Optional. The driver will call on arrival."
        >
          <input
            type="tel"
            inputMode="numeric"
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
            placeholder="+91 70000 00000"
            className={inputClass}
          />
        </Field>
      </div>
    </Modal>
  )
}

/**
 * The customer's address book.
 *
 * It fills itself: every address typed on an order is saved here, so most
 * people will never need to open this page. It exists for tidying up -- fixing
 * a typo, removing a place no longer used.
 */
export default function PortalAddresses() {
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<SavedPlace | null>(null)
  const queryClient = useQueryClient()
  const toast = useToast()

  // Searched and paged by the server, so a long book stays usable.
  const places = usePaged({
    key: ['portal-places'],
    filters: { search: search.trim() || undefined },
    fetchPage: (params) => api.portal.places(params),
    pageSize: 12,
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.portal.deletePlace(id),
    onSuccess: () => {
      toast.success('Address removed', 'Orders already placed are unchanged.')
      void queryClient.invalidateQueries({ queryKey: ['portal-places'] })
    },
    onError: (error) => toast.error('Could not remove it', (error as ApiError).message),
  })

  const list = places.items
  const total = places.page.total

  return (
    <>
      <PortalPageHeader
        title="Saved addresses"
        subtitle="Your godowns and delivery points, kept so you do not retype them."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add address
          </Button>
        }
      />

      {/* The search box earns its place only once the list stops being
          scannable; below that it is one more thing to read past. */}
      {(total > 8 || search !== '') && (
        <div className="mb-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={`Search ${total.toLocaleString()} saved addresses`}
          />
        </div>
      )}

      {places.isInitialLoading ? (
        <Spinner label="Loading your addresses" />
      ) : list.length === 0 ? (
        <Panel>
          <EmptyState
            title={search ? 'No addresses match' : 'Nothing saved yet'}
            hint={
              search
                ? 'Try a shorter search, or add this address now.'
                : 'Addresses you use on an order are saved here automatically. You can also add one now.'
            }
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add address
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          {!search && (
            <div className="mb-4">
              <Callout tone="info">
                These are saved automatically when you place an order.
              </Callout>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((place) => (
              <div key={place.id} className="card p-5">
                <h2 className="text-base font-semibold text-ink">{place.label}</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {place.address}
                </p>
                {place.phone && (
                  <a
                    href={`tel:${place.phone.replace(/\s/g, '')}`}
                    className="mt-1 inline-block text-sm font-medium text-brand hover:underline"
                  >
                    {place.phone}
                  </a>
                )}
                <p className="mt-2 text-xs text-ink-dim">
                  Used on {place.use_count} order{place.use_count === 1 ? '' : 's'}
                </p>
                <div className="mt-4 flex gap-2 border-t border-line pt-4">
                  <Button size="sm" onClick={() => setEditing(place)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(place.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 card">
            <Pagination
              page={places.page}
              onPage={places.setPage}
              pageSize={places.pageSize}
              onPageSize={places.setPageSize}
              noun="addresses"
              busy={places.isPlaceholderData}
            />
          </div>
        </>
      )}

      {adding && <AddressForm open={adding} onClose={() => setAdding(false)} />}
      {editing && (
        <AddressForm open onClose={() => setEditing(null)} place={editing} />
      )}
    </>
  )
}
