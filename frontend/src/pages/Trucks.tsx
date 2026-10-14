import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePaged } from '../lib/usePaged'
import { api, ApiError } from '../lib/api'
import { fmtTons } from '../lib/format'
import type { Truck } from '../lib/types'
import { MetaItem, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Button,
  ErrorNote,
  Field,
  Modal,
  Pagination,
  Panel,
  Spinner,
  inputClass,
  selectClass,
  textareaClass,
} from '../components/ui'
import {
  EMPTY_TRUCK_FILTER,
  TruckFilterBar,
  TruckTable,
  fleetStatusCounts,
  truckQuery,
  type TruckFilterValue,
} from '../components/truckTable'

const BODY_TYPES = ['Open Body', 'Container', 'Trailer', 'Tipper', 'Tanker', 'Reefer']
const FUEL_TYPES = ['Diesel', 'CNG', 'LNG', 'Electric']

export function TruckForm({
  open,
  onClose,
  truck,
}: {
  open: boolean
  onClose: () => void
  truck?: Truck | null
}) {
  const editing = Boolean(truck)
  const queryClient = useQueryClient()
  const toast = useToast()

  // Free drivers only, narrowed by the server; the form needs a short list,
  // not every driver in the fleet.
  const drivers = useQuery({
    queryKey: ['drivers', 'for-truck', truck?.driver?.id ?? null],
    queryFn: () => api.drivers({ unassigned: true, page_size: 200 }),
    enabled: open,
  })

  const [form, setForm] = useState(() => ({
    registration_number: truck?.registration_number ?? '',
    capacity_tons: String(truck?.capacity_tons ?? 20),
    driver_id: truck?.driver?.id ? String(truck.driver.id) : '',
    base_city: truck?.base_city ?? '',
    make: truck?.make ?? '',
    model: truck?.model ?? '',
    year: truck?.year ? String(truck.year) : '',
    axles: truck?.axles ? String(truck.axles) : '',
    body_type: truck?.body_type ?? 'Open Body',
    fuel_type: truck?.fuel_type ?? 'Diesel',
    odometer_km: String(truck?.odometer_km ?? 0),
    notes: truck?.notes ?? '',
  }))

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  // Free drivers, plus whoever is already on this truck.
  const selectableDrivers = useMemo(() => {
    const free = drivers.data?.items ?? []
    const current = truck?.driver
    if (!current || free.some((d) => d.id === current.id)) return free
    return [
      { ...current, truck_id: truck.id, truck_registration: truck.registration_number },
      ...free,
    ]
  }, [drivers.data, truck])

  const onBoard = truck?.capacity.current_load_tons ?? 0
  const capacityTooLow = onBoard > 0 && Number(form.capacity_tons) < onBoard

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        registration_number: form.registration_number.trim().toUpperCase(),
        capacity_tons: Number(form.capacity_tons),
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        base_city: form.base_city.trim() || null,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        year: form.year ? Number(form.year) : null,
        axles: form.axles ? Number(form.axles) : null,
        body_type: form.body_type,
        fuel_type: form.fuel_type,
        odometer_km: Number(form.odometer_km || 0),
        notes: form.notes.trim() || null,
      }
      return editing && truck ? api.updateTruck(truck.id, body) : api.createTruck(body)
    },
    onSuccess: (saved) => {
      toast.success(
        editing ? `${saved.registration_number} updated` : `${saved.registration_number} added`,
        `Capacity ${fmtTons(saved.capacity_tons)}${saved.driver ? ` · ${saved.driver.name}` : ''}`,
      )
      void queryClient.invalidateQueries({ queryKey: ['trucks'] })
      void queryClient.invalidateQueries({ queryKey: ['truck'] })
      void queryClient.invalidateQueries({ queryKey: ['drivers'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (error) => toast.error('Could not save the truck', (error as ApiError).message),
  })

  const ready =
    form.registration_number.trim().length >= 4 &&
    Number(form.capacity_tons) > 0 &&
    !capacityTooLow

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${truck?.registration_number}` : 'Add a truck'}
      description="Capacity and the assigned driver are what the assignment checks rely on."
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add truck'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registration number">
            <input
              value={form.registration_number}
              onChange={(event) => set('registration_number', event.target.value)}
              placeholder="GJ01AB1073"
              className={`${inputClass} font-mono uppercase`}
            />
          </Field>

          <Field
            label="Capacity (tons)"
            hint={
              !capacityTooLow && onBoard > 0
                ? `Currently carrying ${fmtTons(onBoard)}`
                : undefined
            }
            error={
              capacityTooLow
                ? `Cannot go below the ${fmtTons(onBoard)} already on board`
                : undefined
            }
          >
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={form.capacity_tons}
              onChange={(event) => set('capacity_tons', event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field
            label="Assigned driver"
            hint="A driver can only be on one truck at a time."
          >
            <select
              value={form.driver_id}
              onChange={(event) => set('driver_id', event.target.value)}
              className={selectClass}
            >
              <option value="">No driver</option>
              {selectableDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name} · {driver.phone}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Base city" hint="Where the truck is normally parked.">
            <input
              value={form.base_city}
              onChange={(event) => set('base_city', event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="border-t border-line pt-5">
          <p className="label mb-3">Vehicle details</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Make">
              <input
                value={form.make}
                onChange={(e) => set('make', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Model">
              <input
                value={form.model}
                onChange={(e) => set('model', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Year">
              <input
                type="number"
                min="1990"
                max="2030"
                value={form.year}
                onChange={(e) => set('year', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Body type">
              <select
                value={form.body_type}
                onChange={(e) => set('body_type', e.target.value)}
                className={selectClass}
              >
                {BODY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fuel">
              <select
                value={form.fuel_type}
                onChange={(e) => set('fuel_type', e.target.value)}
                className={selectClass}
              >
                {FUEL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Axles">
              <input
                type="number"
                min="2"
                max="8"
                value={form.axles}
                onChange={(e) => set('axles', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Odometer (km)" className="sm:col-span-3">
              <input
                type="number"
                min="0"
                value={form.odometer_km}
                onChange={(e) => set('odometer_km', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Notes" className="sm:col-span-3">
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                className={textareaClass}
              />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function Trucks() {
  const [filter, setFilter] = useState<TruckFilterValue>(EMPTY_TRUCK_FILTER)
  const [adding, setAdding] = useState(false)

  const list = usePaged({
    key: ['trucks'],
    filters: truckQuery(filter),
    fetchPage: (params) => api.trucks(params),
    refetchInterval: 60_000,
  })

  // Fleet-wide figures for the chips and the header, counted by the server
  // rather than derived from the page on screen.
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard(),
    refetchInterval: 60_000,
  })

  const fleet = dashboard.data?.fleet
  const statusCounts = useMemo(() => fleetStatusCounts(fleet), [fleet])

  // Option lists come from the page in hand; the selects are a convenience,
  // and the search box reaches everything regardless.
  const baseCities = useMemo(
    () =>
      Array.from(
        new Set(list.items.map((t) => t.base_city).filter(Boolean) as string[]),
      ).sort(),
    [list.items],
  )
  const capacities = useMemo(
    () => Array.from(new Set(list.items.map((t) => t.capacity_tons))).sort((a, b) => a - b),
    [list.items],
  )

  return (
    <div className="p-6">
      <PageHeader
        title="Trucks"
        subtitle="The fleet, its capacity and who is driving each vehicle."
        meta={
          <>
            <MetaItem label="Fleet">{fleet?.total_trucks ?? 0} trucks</MetaItem>
            {fleet && (
              <MetaItem label="Loaded">
                {fmtTons(fleet.total_load_tons)} of {fmtTons(fleet.total_capacity_tons)}
              </MetaItem>
            )}
            {fleet?.without_driver ? (
              <span className="font-medium text-st-delayed">
                {fleet.without_driver} without a driver
              </span>
            ) : null}
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add truck
          </Button>
        }
      />

      <Panel bodyClassName="overflow-visible">
        <div className="border-b border-line p-4">
          <TruckFilterBar
            value={filter}
            onChange={setFilter}
            statusCounts={statusCounts}
            total={fleet?.total_trucks}
            baseCities={baseCities}
            capacities={capacities}
          />
        </div>
        {list.isInitialLoading ? (
          <Spinner label="Loading trucks" />
        ) : list.isError ? (
          <ErrorNote message="Could not load trucks." onRetry={() => list.refetch()} />
        ) : (
          <>
            <TruckTable trucks={list.items} />
            <Pagination
              page={list.page}
              onPage={list.setPage}
              pageSize={list.pageSize}
              onPageSize={list.setPageSize}
              noun="trucks"
              busy={list.isPlaceholderData}
            />
          </>
        )}
      </Panel>

      {adding && <TruckForm open={adding} onClose={() => setAdding(false)} />}
    </div>
  )
}
