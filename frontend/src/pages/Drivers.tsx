import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { fmtDate } from '../lib/format'
import { DRIVER_STATUS, DRIVER_STATUS_ORDER } from '../lib/status'
import type { Driver, DriverStatus } from '../lib/types'
import { MetaItem, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Button,
  CellStack,
  DriverStatusBadge,
  EmptyState,
  Field,
  FilterChip,
  Modal,
  Pagination,
  Panel,
  SearchInput,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
  inputClass,
  selectClass,
} from '../components/ui'

/* ------------------------------ driver form ------------------------------ */

function DriverForm({
  open,
  onClose,
  driver,
}: {
  open: boolean
  onClose: () => void
  driver?: Driver | null
}) {
  const editing = Boolean(driver)
  const queryClient = useQueryClient()
  const toast = useToast()

  const [form, setForm] = useState(() => ({
    name: driver?.name ?? '',
    phone: driver?.phone ?? '+91 ',
    license_number: driver?.license_number ?? '',
    home_city: driver?.home_city ?? '',
    status: driver?.status ?? 'available',
  }))

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        license_number: form.license_number.trim(),
        home_city: form.home_city.trim() || null,
        status: form.status,
      }
      return editing && driver ? api.updateDriver(driver.id, body) : api.createDriver(body)
    },
    onSuccess: (saved) => {
      toast.success(editing ? `${saved.name} updated` : `${saved.name} added`, saved.code)
      void queryClient.invalidateQueries({ queryKey: ['drivers'] })
      void queryClient.invalidateQueries({ queryKey: ['trucks'] })
      onClose()
    },
    onError: (error) => toast.error('Could not save the driver', (error as ApiError).message),
  })

  const ready =
    form.name.trim().length > 2 &&
    form.phone.trim().length > 6 &&
    form.license_number.trim().length > 4

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${driver?.name}` : 'Add a driver'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add driver'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2">
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Phone">
          <input
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Licence number">
          <input
            value={form.license_number}
            onChange={(e) => set('license_number', e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Home city">
          <input
            value={form.home_city}
            onChange={(e) => set('home_city', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
            className={selectClass}
          >
            {DRIVER_STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {DRIVER_STATUS[status].label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

/* --------------------------- assign truck modal -------------------------- */

function AssignTruckModal({
  driver,
  onClose,
}: {
  driver: Driver | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [truckId, setTruckId] = useState('')

  // "Trucks with no driver" is a server filter, so the list is complete
  // rather than whatever happened to be on the first page.
  const trucks = useQuery({
    queryKey: ['trucks', 'without-driver'],
    queryFn: () => api.trucks({ without_driver: true, page_size: 200 }),
    enabled: Boolean(driver),
  })

  const assign = useMutation({
    mutationFn: () => api.assignDriverToTruck(driver!.id, Number(truckId)),
    onSuccess: (updated) => {
      toast.success(`${updated.name} assigned to ${updated.truck_registration}`)
      void queryClient.invalidateQueries({ queryKey: ['drivers'] })
      void queryClient.invalidateQueries({ queryKey: ['trucks'] })
      onClose()
    },
    onError: (error) => toast.error('Could not assign the truck', (error as ApiError).message),
  })

  const options = trucks.data?.items ?? []

  return (
    <Modal
      open={Boolean(driver)}
      onClose={onClose}
      title={`Assign a truck to ${driver?.name ?? ''}`}
      description="Only trucks without a driver are listed."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!truckId || assign.isPending}
            onClick={() => assign.mutate()}
          >
            {assign.isPending ? 'Assigning…' : 'Assign truck'}
          </Button>
        </>
      }
    >
      <Field
        label="Truck"
        hint="Reassigning is blocked while a trip is in progress."
      >
        <select
          value={truckId}
          onChange={(e) => setTruckId(e.target.value)}
          className={selectClass}
        >
          <option value="">Select a truck</option>
          {options.map((truck) => (
            <option key={truck.id} value={truck.id}>
              {truck.registration_number} · {truck.capacity_tons}T ·{' '}
              {truck.base_city ?? 'no base'}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  )
}

/* -------------------------------- page ----------------------------------- */

export default function Drivers() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<DriverStatus | null>(null)
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [assigningTruck, setAssigningTruck] = useState<Driver | null>(null)
  const queryClient = useQueryClient()
  const toast = useToast()

  // Status, search and "without a truck" are all applied in SQL. Filtering
  // the 25 rows on screen would silently skip every match on later pages.
  const list = usePaged({
    key: ['drivers'],
    filters: {
      status: status ? [status] : undefined,
      search: search.trim() || undefined,
      unassigned: onlyUnassigned || undefined,
    },
    fetchPage: (params) => api.drivers(params),
    refetchInterval: 60_000,
  })

  const stats = useQuery({
    queryKey: ['drivers', 'stats'],
    queryFn: () => api.driverStats(),
    refetchInterval: 60_000,
  })

  const unassign = useMutation({
    mutationFn: (driverId: number) => api.unassignDriver(driverId),
    onSuccess: (updated) => {
      toast.success(`${updated.name} removed from their truck`)
      void queryClient.invalidateQueries({ queryKey: ['drivers'] })
      void queryClient.invalidateQueries({ queryKey: ['trucks'] })
    },
    onError: (error) => toast.error('Could not unassign', (error as ApiError).message),
  })

  const rows = list.items
  const counts = stats.data?.by_status ?? {}
  const withoutTruck = stats.data?.without_truck ?? 0
  const matching = list.page.total

  return (
    <div className="p-6">
      <PageHeader
        title="Drivers"
        subtitle="Who is available, who is out on a trip, and which truck they hold."
        meta={
          <>
            <MetaItem label="Total">
              {(stats.data?.total ?? 0).toLocaleString()} drivers
            </MetaItem>
            {withoutTruck > 0 && (
              <MetaItem label="Without a truck">{withoutTruck}</MetaItem>
            )}
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add driver
          </Button>
        }
      />

      <Panel bodyClassName="overflow-visible">
        <div className="space-y-3 border-b border-line p-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, phone, licence or truck"
            className="max-w-md"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={!status && !onlyUnassigned} onClick={() => {
              setStatus(null)
              setOnlyUnassigned(false)
            }}>
              All
            </FilterChip>
            {DRIVER_STATUS_ORDER.map((option) => {
              const meta = DRIVER_STATUS[option]
              return (
                <FilterChip
                  key={option}
                  active={status === option}
                  onClick={() => setStatus(status === option ? null : option)}
                  dot={meta.dot}
                  count={counts[option]}
                >
                  {meta.label}
                </FilterChip>
              )
            })}
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <FilterChip
              active={onlyUnassigned}
              onClick={() => setOnlyUnassigned((v) => !v)}
              count={withoutTruck}
            >
              Without a truck
            </FilterChip>
            <span className="ml-auto text-sm tabular-nums text-ink-dim">
              {matching.toLocaleString()} matching
            </span>
          </div>
        </div>

        {list.isInitialLoading ? (
          <Spinner label="Loading drivers" />
        ) : rows.length === 0 ? (
          <EmptyState title="No drivers match" hint="Clear the filters to see everyone." />
        ) : (
          <>
          <Table
            minWidth="62rem"
            head={
              <>
                <Th>Driver</Th>
                <Th>Phone</Th>
                <Th>Licence</Th>
                <Th>Truck</Th>
                <Th>Status</Th>
                <Th>Current trip</Th>
                <Th align="right">Trips done</Th>
                <Th />
              </>
            }
          >
            {rows.map((driver) => (
              <Tr key={driver.id} to={`/drivers/${driver.id}`}>
                <Td>
                  <CellStack
                    primary={
                      <Link to={`/drivers/${driver.id}`} className="hover:text-brand">
                        {driver.name}
                      </Link>
                    }
                    secondary={driver.home_city ?? driver.code}
                  />
                </Td>
                <Td>
                  <a
                    href={`tel:${driver.phone.replace(/\s/g, '')}`}
                    className="text-ink hover:text-brand"
                  >
                    {driver.phone}
                  </a>
                </Td>
                <Td>
                  <CellStack
                    primary={<span className="font-mono text-sm">{driver.license_number}</span>}
                    secondary={`Expires ${fmtDate(driver.license_expiry)}`}
                  />
                </Td>
                <Td>
                  {driver.truck_id ? (
                    <Link
                      to={`/trucks/${driver.truck_id}`}
                      className="font-mono text-sm font-medium text-ink hover:text-brand"
                    >
                      {driver.truck_registration}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-st-delayed">None</span>
                  )}
                </Td>
                <Td>
                  <DriverStatusBadge status={driver.status} size="sm" />
                </Td>
                <Td>
                  {driver.current_trip_id ? (
                    <Link
                      to={`/trips/${driver.current_trip_id}`}
                      className="font-mono text-sm font-medium text-brand hover:underline"
                    >
                      {driver.current_trip_code}
                    </Link>
                  ) : (
                    <span className="text-ink-dim">—</span>
                  )}
                </Td>
                <Td align="right" className="tabular-nums">
                  {driver.completed_trips}
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(driver)}>
                      Edit
                    </Button>
                    {driver.truck_id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unassign.mutate(driver.id)}
                        disabled={unassign.isPending}
                      >
                        Unassign
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setAssigningTruck(driver)}>
                        Assign truck
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
          <Pagination
            page={list.page}
            onPage={list.setPage}
            pageSize={list.pageSize}
            onPageSize={list.setPageSize}
            noun="drivers"
            busy={list.isPlaceholderData}
          />
          </>
        )}
      </Panel>

      {adding && <DriverForm open={adding} onClose={() => setAdding(false)} />}
      {editing && <DriverForm open onClose={() => setEditing(null)} driver={editing} />}
      <AssignTruckModal driver={assigningTruck} onClose={() => setAssigningTruck(null)} />
    </div>
  )
}
