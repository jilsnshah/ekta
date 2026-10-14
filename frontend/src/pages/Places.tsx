import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtAgo } from '../lib/format'
import type { SavedPlace } from '../lib/types'
import { IconPin, IconPlus } from '../components/icons'
import { MetaItem, PageBody, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Button,
  CellStack,
  Callout,
  ChipBar,
  EmptyState,
  Field,
  FilterChip,
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
  textareaClass,
} from '../components/ui'

const CONTROL_ROOM = 'Control room'

function PlaceForm({
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
        ? api.updatePlace(place.id, body)
        : api.createPlace(body)
    },
    onSuccess: (saved) => {
      toast.success(editing ? `${saved.label} updated` : `${saved.label} saved`)
      void queryClient.invalidateQueries({ queryKey: ['places'] })
      onClose()
    },
    onError: (error) => toast.error('Could not save it', (error as ApiError).message),
  })

  const ready = form.label.trim().length >= 2 && form.address.trim().length >= 3

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${place?.label}` : 'Add an address'}
      description="Available on every order form in the control room."
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
        <Field label="Name of the place">
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
        <Field label="Site phone" hint="Optional. The driver calls this on arrival.">
          <input
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
    </Modal>
  )
}

/**
 * Every saved pickup and delivery point the operation knows about: the control
 * room's own book, plus each customer's.
 *
 * A customer's entries are read-only here. Their address book is theirs, and
 * the control room editing it behind their back would be a surprise.
 */
export default function Places() {
  const [search, setSearch] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<SavedPlace | null>(null)
  const queryClient = useQueryClient()
  const toast = useToast()

  // Searching and filtering happen in SQL. Narrowing the rows already on
  // screen would miss every match on the other pages.
  const list = usePaged({
    key: ['places'],
    filters: {
      search: search.trim() || undefined,
      mine_only: mineOnly || undefined,
    },
    fetchPage: (params) => api.places(params),
    refetchInterval: 120_000,
  })

  // One row fetched purely for its `total`: the book is too big to count in
  // the browser, and the header wants the control room's own share of it.
  const ownCount = useQuery({
    queryKey: ['places', 'own-count'],
    queryFn: () => api.places({ mine_only: true, page_size: 1 }),
    select: (page) => page.total,
    refetchInterval: 120_000,
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.deletePlace(id),
    onSuccess: () => {
      toast.success('Address removed', 'Orders already raised are unchanged.')
      void queryClient.invalidateQueries({ queryKey: ['places'] })
    },
    onError: (error) => toast.error('Could not remove it', (error as ApiError).message),
  })

  const rows = list.items
  const total = list.page.total

  return (
    <PageBody>
      <PageHeader
        title="Addresses"
        subtitle="Pickup and delivery points, offered on every order form."
        meta={
          <>
            <MetaItem label="Matching">{total.toLocaleString('en-IN')}</MetaItem>
            <MetaItem label="Control room's own">{ownCount.data ?? '—'}</MetaItem>
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <IconPlus size={17} />
            Add address
          </Button>
        }
      />

      <div className="mb-4">
        <Callout tone="info">
          Addresses save themselves whenever an order is raised, here or in the
          customer portal. A customer's own entries are read-only.
        </Callout>
      </div>

      <Panel bodyClassName="overflow-visible">
        <div className="space-y-3 border-b border-line p-4 sm:px-5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, address or phone"
            className="lg:max-w-md"
          />
          <ChipBar>
            <FilterChip active={!mineOnly} onClick={() => setMineOnly(false)}>
              Everyone
            </FilterChip>
            <FilterChip
              active={mineOnly}
              onClick={() => setMineOnly(true)}
              count={ownCount.data}
            >
              {CONTROL_ROOM}'s own
            </FilterChip>
          </ChipBar>
        </div>

        {list.isInitialLoading ? (
          <Spinner label="Loading addresses" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<IconPin size={20} />}
            title={search || mineOnly ? 'No addresses match' : 'Nothing saved yet'}
            hint={
              search || mineOnly
                ? 'Clear the search and filters to see everything.'
                : 'Addresses save themselves when an order is raised.'
            }
          />
        ) : (
          <ResponsiveList
      breakpoint="xl"
            cards={
              <ul className="divide-y divide-line">
                {rows.map((place) => {
                  const isMine = (place.owner ?? CONTROL_ROOM) === CONTROL_ROOM
                  return (
                    <li key={place.id} className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft">
                          <IconPin size={17} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-ink">{place.label}</p>
                          <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
                            {place.address}
                          </p>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-dim">
                            {place.phone && <span className="font-mono">{place.phone}</span>}
                            <span>Used {place.use_count}×</span>
                            <Pill>{place.owner ?? CONTROL_ROOM}</Pill>
                          </p>
                        </div>
                      </div>
                      {isMine && (
                        <div className="mt-3 flex gap-2 pl-12">
                          <Button size="sm" onClick={() => setEditing(place)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove.mutate(place.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            }
            table={
              <Table
                minWidth="56rem"
                head={
                  <>
                    <Th>Name</Th>
                    <Th>Address</Th>
                    <Th>Site phone</Th>
                    <Th>Belongs to</Th>
                    <Th align="right">Used</Th>
                    <Th align="right">Last used</Th>
                    <Th />
                  </>
                }
              >
                {rows.map((place) => {
                  const isMine = (place.owner ?? CONTROL_ROOM) === CONTROL_ROOM
                  return (
                    <Tr key={place.id}>
                      <Td>
                        <span className="font-medium text-ink">{place.label}</span>
                      </Td>
                      <Td className="max-w-80">
                        <CellStack primary={place.address} />
                      </Td>
                      <Td>
                        {place.phone ? (
                          <a
                            href={`tel:${place.phone.replace(/\s/g, '')}`}
                            className="font-mono text-[0.8125rem] text-ink hover:text-brand"
                          >
                            {place.phone}
                          </a>
                        ) : (
                          <span className="text-ink-dim">—</span>
                        )}
                      </Td>
                      <Td>
                        <Pill>{place.owner ?? CONTROL_ROOM}</Pill>
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {place.use_count}
                      </Td>
                      <Td align="right" className="text-ink-soft">
                        {place.last_used_at ? fmtAgo(place.last_used_at) : '—'}
                      </Td>
                      <Td align="right">
                        {isMine ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing(place)}
                            >
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
                        ) : (
                          <span className="text-xs text-ink-dim">Customer's own</span>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </Table>
            }
          />
        )}

        {rows.length > 0 && (
          <Pagination
            page={list.page}
            onPage={list.setPage}
            pageSize={list.pageSize}
            onPageSize={list.setPageSize}
            noun="addresses"
            busy={list.isPlaceholderData}
          />
        )}
      </Panel>

      {adding && <PlaceForm open={adding} onClose={() => setAdding(false)} />}
      {editing && <PlaceForm open onClose={() => setEditing(null)} place={editing} />}
    </PageBody>
  )
}
