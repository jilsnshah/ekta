import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDay, fmtTons } from '../../lib/format'
import type { Company } from '../../lib/types'
import { PortalPageTitle } from '../../components/portalShell'
import {
  EMPTY_PLACE,
  PlacePicker,
  PlaceSummary,
  placeIsComplete,
  type PlaceValue,
} from '../../components/placePicker'
import { useToast } from '../../components/toast'
import {
  Button,
  Callout,
  Field,
  Spinner,
  inputClass,
  textareaClass,
} from '../../components/ui'

/* --------------------------------- steps --------------------------------- */

const STEPS = [
  { key: 'company', label: 'Company' },
  { key: 'pickup', label: 'Pick up' },
  { key: 'drop', label: 'Deliver' },
  { key: 'goods', label: 'Goods' },
  { key: 'review', label: 'Review' },
] as const

type StepKey = (typeof STEPS)[number]['key']

/** A plain progress bar with the step named, so nobody feels lost. */
function Steps({ current }: { current: number }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-ink">
          Step {current + 1} of {STEPS.length}
          <span className="ml-2 font-normal text-ink-soft">
            {STEPS[current].label}
          </span>
        </p>
        <p className="text-sm text-ink-dim">
          {Math.round(((current + 1) / STEPS.length) * 100)}%
        </p>
      </div>
      <div className="mt-2 flex gap-1.5">
        {STEPS.map((step, index) => (
          <span
            key={step.key}
            className={clsx(
              'h-1.5 flex-1 rounded-full transition-colors',
              index <= current ? 'bg-brand' : 'bg-surface-3',
            )}
          />
        ))}
      </div>
    </div>
  )
}

function StepCard({
  question,
  help,
  children,
}: {
  question: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-ink">{question}</h2>
      {help && <p className="mt-1 text-sm text-ink-soft">{help}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

/* ----------------------------- company step ------------------------------ */

/**
 * Companies are chosen *or created right here*. A first-time customer has no
 * company yet, and sending them away to another screen to find out what one
 * is was the single biggest wall in this flow.
 */
function CompanyStep({
  companies,
  value,
  onChange,
}: {
  companies: Company[]
  value: string
  onChange: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { refreshParty } = useAuth()
  const [adding, setAdding] = useState(companies.length === 0)
  const [name, setName] = useState('')
  const [gst, setGst] = useState('')

  const create = useMutation({
    mutationFn: async () => {
      const created = await api.portal.createCompany({
        name: name.trim(),
        gst_number: gst.trim() || null,
      })
      refreshParty(await api.portal.me())
      return created
    },
    onSuccess: (created) => {
      toast.success(`${created.name} added`)
      void queryClient.invalidateQueries({ queryKey: ['portal-companies'] })
      onChange(String(created.id))
      setAdding(false)
      setName('')
      setGst('')
    },
    onError: (error) => toast.error('Could not add it', (error as ApiError).message),
  })

  return (
    <div className="space-y-3">
      {companies.length > 0 && !adding && (
        <>
          {/* Above the list: nobody scrolls past their companies to find it. */}
          <button
            onClick={() => setAdding(true)}
            className="h-11 w-full rounded-md border border-dashed border-line-strong text-sm font-semibold text-brand transition-colors hover:bg-surface-2"
          >
            + Add another company
          </button>
          <ul className="space-y-2">
            {companies.map((company) => {
              const active = value === String(company.id)
              return (
                <li key={company.id}>
                  <button
                    onClick={() => onChange(String(company.id))}
                    aria-pressed={active}
                    className={clsx(
                      'w-full rounded-lg border p-4 text-left transition-colors',
                      active
                        ? 'border-brand bg-brand-tint ring-2 ring-brand/20'
                        : 'border-line bg-surface-1 hover:bg-surface-2',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-base font-semibold text-ink">
                        {company.name}
                      </span>
                      {active && (
                        <span className="shrink-0 text-sm font-semibold text-brand">
                          Selected
                        </span>
                      )}
                    </div>
                    {company.gst_number && (
                      <p className="mt-0.5 font-mono text-xs text-ink-dim">
                        {company.gst_number}
                      </p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {adding && (
        <div className="space-y-4">
          {companies.length === 0 && (
            <Callout tone="info">
              This is the name that will appear on your bill. You only need to do
              this once.
            </Callout>
          )}

          <Field label="Company name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="ABC Industries"
              className={inputClass}
            />
          </Field>

          <Field label="GST number" hint="Optional.">
            <input
              value={gst}
              onChange={(event) => setGst(event.target.value)}
              className={`${inputClass} font-mono uppercase`}
            />
          </Field>

          <div className="flex gap-2">
            {companies.length > 0 && (
              <Button onClick={() => setAdding(false)} className="flex-1">
                Cancel
              </Button>
            )}
            <Button
              variant="primary"
              className="flex-1"
              disabled={name.trim().length < 2 || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Saving…' : 'Save company'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------------------------- page ---------------------------------- */

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export default function PortalNewOrder() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const companies = useQuery({
    queryKey: ['portal-companies'],
    queryFn: () => api.portal.companies(),
  })
  // The pickers search the address book on the server. A customer with a
  // thousand godowns gets the ones they use most, and the search box reaches
  // the rest -- nothing is hidden behind a page boundary.
  const [placeSearch, setPlaceSearch] = useState('')
  const places = useQuery({
    queryKey: ['portal-places', placeSearch.trim()],
    queryFn: () =>
      api.portal.places({ search: placeSearch.trim() || undefined, page_size: 25 }),
  })

  const [step, setStep] = useState(0)
  const [companyId, setCompanyId] = useState('')
  const [pickup, setPickup] = useState<PlaceValue>(EMPTY_PLACE)
  const [drop, setDrop] = useState<PlaceValue>(EMPTY_PLACE)
  const [goods, setGoods] = useState({
    material: '',
    quantity_tons: '',
    pickup_date: tomorrowIso(),
    order_number: '',
    special_instructions: '',
  })

  const setGood = (key: keyof typeof goods, value: string) =>
    setGoods((current) => ({ ...current, [key]: value }))

  const companyList = companies.data ?? []
  const savedPlaces = places.data?.items ?? []
  const savedTotal = places.data?.total

  // One company and nothing to choose: preselect it.
  const effectiveCompany =
    companyId || (companyList.length === 1 ? String(companyList[0].id) : '')

  const chosenCompany = companyList.find((c) => String(c.id) === effectiveCompany)

  const create = useMutation({
    mutationFn: () =>
      api.portal.createOrder({
        company_id: Number(effectiveCompany),
        order_number: goods.order_number.trim() || null,
        material: goods.material.trim(),
        quantity_tons: Number(goods.quantity_tons),
        pickup_name: pickup.label.trim(),
        pickup_phone: pickup.phone.trim() || null,
        pickup_address: pickup.address.trim(),
        drop_name: drop.label.trim(),
        drop_phone: drop.phone.trim() || null,
        drop_address: drop.address.trim(),
        pickup_date: goods.pickup_date,
        special_instructions: goods.special_instructions.trim() || null,
      }),
    onSuccess: (order) => {
      toast.success(
        `Order ${order.code} placed`,
        'We have it. You will see a truck here once one is allocated.',
      )
      void queryClient.invalidateQueries({ queryKey: ['portal-orders'] })
      void queryClient.invalidateQueries({ queryKey: ['portal-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['portal-places'] })
      navigate(`/portal/orders/${order.id}?placed=1`)
    },
    onError: (error) =>
      toast.error('Could not place the order', (error as ApiError).message),
  })

  const canContinue = useMemo<Record<StepKey, boolean>>(
    () => ({
      company: Boolean(effectiveCompany),
      pickup: placeIsComplete(pickup),
      drop: placeIsComplete(drop),
      goods:
        goods.material.trim().length > 0 &&
        Number(goods.quantity_tons) > 0 &&
        Boolean(goods.pickup_date),
      review: true,
    }),
    [effectiveCompany, pickup, drop, goods],
  )

  const currentKey = STEPS[step].key
  const isLast = step === STEPS.length - 1

  if (companies.isLoading || places.isLoading) {
    return <Spinner label="Getting things ready" />
  }

  return (
    <>
      <PortalPageTitle
        title="Place an order"
        subtitle="Five short steps. We will keep what you type for next time."
      />

      <Steps current={step} />

      <div className="space-y-4">
        {currentKey === 'company' && (
          <StepCard
            question="Who should this be billed to?"
            help={
              companyList.length === 0
                ? 'Add your company to get started.'
                : 'Pick the company this order is for.'
            }
          >
            <CompanyStep
              companies={companyList}
              value={effectiveCompany}
              onChange={setCompanyId}
            />
          </StepCard>
        )}

        {currentKey === 'pickup' && (
          <StepCard
            question="Where should we pick up?"
            help="The place our truck will collect the goods from."
          >
            <PlacePicker
              saved={savedPlaces}
              value={pickup}
              onChange={setPickup}
              newLabelHint="Something you will recognise next time."
              idPrefix="pickup"
              search={placeSearch}
              onSearch={setPlaceSearch}
              total={savedTotal}
            />
          </StepCard>
        )}

        {currentKey === 'drop' && (
          <StepCard
            question="Where should we deliver?"
            help="The place the goods must reach."
          >
            <PlacePicker
              saved={savedPlaces}
              value={drop}
              onChange={setDrop}
              newLabelHint="Something you will recognise next time."
              idPrefix="drop"
              search={placeSearch}
              onSearch={setPlaceSearch}
              total={savedTotal}
            />
          </StepCard>
        )}

        {currentKey === 'goods' && (
          <StepCard question="What are we carrying?">
            <div className="space-y-4">
              <Field label="What are the goods?">
                <input
                  value={goods.material}
                  onChange={(event) => setGood('material', event.target.value)}
                  placeholder="Steel rods"
                  className={inputClass}
                />
              </Field>

              <Field label="How much, in tons?" hint="Example: 12 or 12.5">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  inputMode="decimal"
                  value={goods.quantity_tons}
                  onChange={(event) => setGood('quantity_tons', event.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Which day should we pick up?">
                <input
                  type="date"
                  value={goods.pickup_date}
                  onChange={(event) => setGood('pickup_date', event.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field
                label="Your own reference number"
                hint="Optional. Useful if you track orders by your own number."
              >
                <input
                  value={goods.order_number}
                  onChange={(event) => setGood('order_number', event.target.value)}
                  placeholder="PO-7781"
                  className={inputClass}
                />
              </Field>

              <Field label="Anything the driver should know?" hint="Optional.">
                <textarea
                  rows={3}
                  value={goods.special_instructions}
                  onChange={(event) =>
                    setGood('special_instructions', event.target.value)
                  }
                  placeholder="Covered truck only. Call before arriving."
                  className={textareaClass}
                />
              </Field>
            </div>
          </StepCard>
        )}

        {currentKey === 'review' && (
          <StepCard
            question="Does this look right?"
            help="Check it over, then place the order."
          >
            <div className="divide-y divide-line">
              <div className="flex items-start justify-between gap-3 pb-4">
                <div>
                  <p className="label">Billed to</p>
                  <p className="mt-1 text-base font-semibold text-ink">
                    {chosenCompany?.name}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setStep(0)}>
                  Change
                </Button>
              </div>

              <div className="py-4">
                <PlaceSummary
                  title="Pick up from"
                  value={pickup}
                  onEdit={() => setStep(1)}
                />
              </div>

              <div className="py-4">
                <PlaceSummary
                  title="Deliver to"
                  value={drop}
                  onEdit={() => setStep(2)}
                />
              </div>

              <div className="flex items-start justify-between gap-3 pt-4">
                <div>
                  <p className="label">Goods</p>
                  <p className="mt-1 text-base font-semibold text-ink">
                    {goods.material} · {fmtTons(Number(goods.quantity_tons))}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    Pick up on {fmtDay(goods.pickup_date)}
                  </p>
                  {goods.order_number && (
                    <p className="text-sm text-ink-dim">
                      Your reference: {goods.order_number}
                    </p>
                  )}
                  {goods.special_instructions && (
                    <p className="mt-1 text-sm text-ink-soft">
                      “{goods.special_instructions}”
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setStep(3)}>
                  Change
                </Button>
              </div>
            </div>
          </StepCard>
        )}

        {/* Navigation sits at the bottom, where a thumb already is. */}
        <div className="flex gap-3">
          <Button
            className="h-12 flex-1"
            onClick={() => (step === 0 ? navigate('/portal') : setStep(step - 1))}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {isLast ? (
            <Button
              variant="primary"
              className="h-12 flex-[2] text-base"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Placing…' : 'Place order'}
            </Button>
          ) : (
            <Button
              variant="primary"
              className="h-12 flex-[2] text-base"
              disabled={!canContinue[currentKey]}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </Button>
          )}
        </div>

        {!canContinue[currentKey] && !isLast && (
          <p className="pb-2 text-center text-sm text-ink-dim">
            {currentKey === 'company'
              ? 'Choose or add a company to continue.'
              : currentKey === 'goods'
                ? 'Fill in the goods, the weight and the pickup day.'
                : 'Choose a saved address, or fill in the name and address.'}
          </p>
        )}
      </div>
    </>
  )
}
