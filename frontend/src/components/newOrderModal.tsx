import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'
import { fmtTons } from '../lib/format'
import {
  CustomerPicker,
  billToComplete,
  billToCustomerId,
  resolveBillTo,
  type BillTo,
} from './customerPicker'
import { IconCustomers, IconOrders, IconPackageDown, IconPackageUp } from './icons'
import { FormSection } from './orderBits'
import { EMPTY_PLACE, PlacePicker, placeIsComplete, type PlaceValue } from './placePicker'
import { useToast } from './toast'
import { Button, Field, Modal, inputClass, textareaClass } from './ui'

function todayIso(offsetDays = 1): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/**
 * The address book for one picker. Once the customer is known it is their book
 * first, then the control room's -- their godowns are what they will want.
 * Searched on the server, and separately for pickup and drop, so typing in one
 * never narrows the other.
 */
function usePlaceBook(open: boolean, customerId: number | null) {
  const [search, setSearch] = useState('')
  const query = useQuery({
    queryKey: ['places', 'picker', customerId, search.trim()],
    queryFn: () =>
      api.places({
        search: search.trim() || undefined,
        account_id: customerId ?? undefined,
        page_size: 25,
      }),
    enabled: open,
  })
  return { search, setSearch, items: query.data?.items ?? [], total: query.data?.total }
}

export function NewOrderModal({
  open,
  onClose,
  customerId: initialCustomerId,
}: {
  open: boolean
  onClose: () => void
  /** Open with this customer already chosen, e.g. from their page. */
  customerId?: number
}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [billTo, setBillTo] = useState<BillTo | null>(null)
  const customerId = billToCustomerId(billTo)
  const pickupBook = usePlaceBook(open, customerId)
  const dropBook = usePlaceBook(open, customerId)

  const [form, setForm] = useState({
    order_number: '',
    material: '',
    quantity_tons: '',
    pickup_date: todayIso(1),
    special_instructions: '',
  })
  const [pickup, setPickup] = useState<PlaceValue>(EMPTY_PLACE)
  const [drop, setDrop] = useState<PlaceValue>(EMPTY_PLACE)

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const create = useMutation({
    // A new customer or company is created only now, so cancelling the form
    // never leaves half a customer behind.
    mutationFn: async () => {
      const companyId = await resolveBillTo(billTo!)
      return api.createOrder({
        company_id: companyId,
        order_number: form.order_number.trim() || null,
        material: form.material.trim(),
        quantity_tons: Number(form.quantity_tons),
        pickup_name: pickup.label.trim(),
        pickup_phone: pickup.phone.trim() || null,
        pickup_address: pickup.address.trim(),
        drop_name: drop.label.trim(),
        drop_phone: drop.phone.trim() || null,
        drop_address: drop.address.trim(),
        pickup_date: form.pickup_date,
        special_instructions: form.special_instructions.trim() || null,
      })
    },
    onSuccess: (order) => {
      toast.success(
        `${order.code} created`,
        `${order.material} · ${fmtTons(order.quantity_tons)} for ${order.billing_party}`,
      )
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['board'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['places'] })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      void queryClient.invalidateQueries({ queryKey: ['customer'] })
      void queryClient.invalidateQueries({ queryKey: ['companies'] })
      onClose()
    },
    onError: (error) => {
      const payload = (error as ApiError).payload as
        | { detail?: string | { message?: string } }
        | undefined
      const detail = payload?.detail
      toast.error(
        'Could not create the order',
        typeof detail === 'string' ? detail : (detail?.message ?? (error as Error).message),
      )
    },
  })

  const ready =
    billToComplete(billTo) &&
    form.material.trim() &&
    Number(form.quantity_tons) > 0 &&
    form.pickup_date &&
    placeIsComplete(pickup) &&
    placeIsComplete(drop)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New transport order"
      description="Billed to a customer's company, so it shows in their portal when they sign in."
      width="max-w-4xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Creating…' : 'Create order'}
          </Button>
        </>
      }
    >
      <div className="space-y-7">
        <FormSection title="Customer" icon={<IconCustomers size={15} />}>
          <CustomerPicker
            value={billTo}
            onChange={setBillTo}
            initialCustomerId={initialCustomerId}
          />
        </FormSection>

        <FormSection title="Consignment" icon={<IconOrders size={15} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Order no." optional hint="The party's own reference.">
              <input
                value={form.order_number}
                onChange={(event) => set('order_number', event.target.value)}
                placeholder="PO-7781"
                className={inputClass}
              />
            </Field>

            <Field label="Material" className="sm:col-start-1 sm:row-start-1">
              <input
                value={form.material}
                onChange={(event) => set('material', event.target.value)}
                placeholder="Steel rods"
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Weight (tons)">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  step="0.1"
                  value={form.quantity_tons}
                  onChange={(event) => set('quantity_tons', event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Pickup date">
                <input
                  type="date"
                  value={form.pickup_date}
                  onChange={(event) => set('pickup_date', event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </FormSection>

        <div className="grid gap-7 lg:grid-cols-2 lg:gap-6">
          <FormSection title="Pick up from" icon={<IconPackageUp size={15} />}>
            <PlacePicker
              saved={pickupBook.items}
              value={pickup}
              onChange={setPickup}
              newLabelHint="Saved to the address book for next time."
              idPrefix="admin-pickup"
              search={pickupBook.search}
              onSearch={pickupBook.setSearch}
              total={pickupBook.total}
            />
          </FormSection>

          <FormSection title="Deliver to" icon={<IconPackageDown size={15} />}>
            <PlacePicker
              saved={dropBook.items}
              value={drop}
              onChange={setDrop}
              newLabelHint="Saved to the address book for next time."
              idPrefix="admin-drop"
              search={dropBook.search}
              onSearch={dropBook.setSearch}
              total={dropBook.total}
            />
          </FormSection>
        </div>

        <Field label="Special instructions" optional>
          <textarea
            rows={2}
            value={form.special_instructions}
            onChange={(event) => set('special_instructions', event.target.value)}
            placeholder="Covered body only, gate closes at 6 pm…"
            className={textareaClass}
          />
        </Field>
      </div>
    </Modal>
  )
}
