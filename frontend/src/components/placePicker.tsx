import clsx from 'clsx'
import { useMemo, useState } from 'react'
import type { SavedPlace } from '../lib/types'
import { IconCheck, IconChevronLeft, IconPin, IconPlus } from './icons'
import { Button, Field, SearchInput, inputClass, textareaClass } from './ui'

/** Above this many saved places, scrolling stops being a way to find one. */
const SEARCH_THRESHOLD = 6

export interface PlaceValue {
  label: string
  phone: string
  address: string
}

export const EMPTY_PLACE: PlaceValue = { label: '', phone: '', address: '' }

export function placeIsComplete(value: PlaceValue): boolean {
  return value.label.trim().length > 0 && value.address.trim().length > 0
}

/**
 * Choose a place from the address book, or type a new one.
 *
 * Saved entries lead, because after the first couple of orders that is almost
 * always what is wanted -- the whole point is not retyping the same godown.
 * Typing a new address is one tap away and saves itself on submission.
 */
export function PlacePicker({
  saved,
  value,
  onChange,
  newLabelHint,
  idPrefix,
  search,
  onSearch,
  total,
}: {
  saved: SavedPlace[]
  value: PlaceValue
  onChange: (next: PlaceValue) => void
  newLabelHint: string
  idPrefix: string
  /**
   * Supply these to have the server do the searching. `saved` is then taken
   * to be the server's answer and is shown as given. Without them the picker
   * filters the list it was handed, which is fine for a short book but would
   * miss entries beyond the first page of a long one.
   */
  search?: string
  onSearch?: (term: string) => void
  /** How many entries exist in all, when `saved` is only a page of them. */
  total?: number
}) {
  // Start on the saved list when there is one, otherwise straight to the form.
  const [mode, setMode] = useState<'saved' | 'new'>(
    saved.length > 0 ? 'saved' : 'new',
  )

  const selectedId = saved.find(
    (place) =>
      place.label === value.label && place.address === value.address,
  )?.id

  const choose = (place: SavedPlace) =>
    onChange({
      label: place.label,
      phone: place.phone ?? '',
      address: place.address,
    })

  // A live search with no hits still belongs on the saved tab: dropping to
  // the form would throw away the term the user just typed.
  if (mode === 'saved' && (saved.length > 0 || Boolean(search))) {
    return (
      <SavedList
        saved={saved}
        selectedId={selectedId}
        onChoose={choose}
        onNew={() => {
          onChange(EMPTY_PLACE)
          setMode('new')
        }}
        search={search}
        onSearch={onSearch}
        total={total}
      />
    )
  }

  return (
    <div className="space-y-4">
      {saved.length > 0 && (
        <button
          type="button"
          onClick={() => {
            onChange(EMPTY_PLACE)
            setMode('saved')
          }}
          className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm font-medium text-brand hover:bg-brand-tint"
        >
          <IconChevronLeft size={15} />
          Choose a saved address instead
        </button>
      )}

      <Field label="Name of the place" hint={newLabelHint}>
        <input
          id={`${idPrefix}-label`}
          value={value.label}
          onChange={(event) => onChange({ ...value, label: event.target.value })}
          placeholder="Naroda Godown"
          className={inputClass}
        />
      </Field>

      <Field label="Full address">
        <textarea
          id={`${idPrefix}-address`}
          rows={3}
          value={value.address}
          onChange={(event) => onChange({ ...value, address: event.target.value })}
          placeholder="Block C, Naroda GIDC, Ahmedabad - 382330"
          className={textareaClass}
        />
      </Field>

      <Field
        label="Phone number at this place"
        optional
        hint="The driver calls this number on arrival."
      >
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          inputMode="numeric"
          value={value.phone}
          onChange={(event) => onChange({ ...value, phone: event.target.value })}
          placeholder="+91 70000 00000"
          className={inputClass}
        />
      </Field>

      <p className="text-sm text-ink-dim">
        We will save this address so you can pick it next time.
      </p>
    </div>
  )
}

/**
 * The saved list, with its controls at the top.
 *
 * "Enter a new address" sits above the list, not below it: with a long book
 * nobody scrolls to the bottom to find it. A filter appears once the list is
 * long enough that scanning it stops working.
 */
function SavedList({
  saved,
  selectedId,
  onChoose,
  onNew,
  search: serverSearch,
  onSearch,
  total,
}: {
  saved: SavedPlace[]
  selectedId?: number
  onChoose: (place: SavedPlace) => void
  onNew: () => void
  search?: string
  onSearch?: (term: string) => void
  total?: number
}) {
  const [localSearch, setLocalSearch] = useState('')
  const remote = Boolean(onSearch)

  const search = remote ? serverSearch ?? '' : localSearch
  const setSearch = remote ? onSearch! : setLocalSearch

  // When the server searched, `saved` is already the answer; filtering it
  // again here would only hide rows the server meant to return.
  const shown = useMemo(() => {
    if (remote) return saved
    const term = localSearch.trim().toLowerCase()
    if (!term) return saved
    return saved.filter((place) =>
      `${place.label} ${place.address}`.toLowerCase().includes(term),
    )
  }, [remote, saved, localSearch])

  const count = total ?? saved.length
  const showSearch = remote ? count > SEARCH_THRESHOLD || search !== '' : saved.length > SEARCH_THRESHOLD

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onNew}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm font-semibold text-brand transition-colors hover:border-brand/50 hover:bg-brand-tint"
      >
        <IconPlus size={16} />
        Enter a new address
      </button>

      {showSearch && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`Search ${count.toLocaleString()} saved addresses`}
        />
      )}

      {remote && total !== undefined && total > saved.length && !search && (
        <p className="px-1 text-xs text-ink-dim">
          Showing the {saved.length} you use most. Search to reach the other{' '}
          {(total - saved.length).toLocaleString()}.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="px-1 py-3 text-sm text-ink-dim">
          Nothing matches “{search}”. Clear the search, or enter a new address.
        </p>
      ) : (
        <ul className="space-y-2 sm:max-h-[22rem] sm:overflow-y-auto sm:overscroll-contain sm:pr-1">
          {shown.map((place) => {
            const active = selectedId === place.id
            return (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => onChoose(place)}
                  aria-pressed={active}
                  className={clsx(
                    'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-[border-color,background-color,box-shadow]',
                    active
                      ? 'border-brand/50 bg-brand-tint ring-2 ring-brand/15'
                      : 'border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2/60',
                  )}
                >
                  <span
                    className={clsx(
                      'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
                      active ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface-1',
                    )}
                  >
                    {active && <IconCheck size={12} strokeWidth={2.4} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] font-semibold text-ink">
                      {place.label}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-ink-soft">
                      {place.address}
                    </span>
                    {place.phone && (
                      <span className="mt-0.5 block font-mono text-xs text-ink-dim">
                        {place.phone}
                      </span>
                    )}
                  </span>
                  {place.owner && place.owner !== 'Control room' && (
                    <span className="hidden shrink-0 items-center gap-1 text-xs text-ink-dim sm:inline-flex">
                      <IconPin size={12} />
                      {place.owner}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** A compact read-only summary, for the review step. */
export function PlaceSummary({
  title,
  value,
  onEdit,
}: {
  title: string
  value: PlaceValue
  onEdit: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="label">{title}</p>
        <p className="mt-1 text-base font-semibold text-ink">{value.label}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{value.address}</p>
        {value.phone && <p className="mt-0.5 font-mono text-xs text-ink-dim">{value.phone}</p>}
      </div>
      <Button size="sm" variant="ghost" onClick={onEdit}>
        Change
      </Button>
    </div>
  )
}
