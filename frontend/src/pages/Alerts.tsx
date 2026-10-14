import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { usePaged } from '../lib/usePaged'
import { SEVERITY, SEVERITY_ORDER } from '../lib/status'
import { AlertItem } from '../components/alertItem'
import { MetaItem, PageHeader } from '../components/shell'
import { useToast } from '../components/toast'
import {
  Button,
  EmptyState,
  FilterChip,
  Pagination,
  Panel,
  SearchInput,
  Spinner,
} from '../components/ui'

export default function Alerts() {
  const [severity, setSeverity] = useState<string | null>(null)
  const [showAcknowledged, setShowAcknowledged] = useState(false)
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const toast = useToast()

  const list = usePaged({
    key: ['alerts'],
    filters: {
      severity: severity ? [severity] : undefined,
      acknowledged: showAcknowledged ? undefined : false,
      search: search.trim() || undefined,
    },
    fetchPage: (params) => api.alerts(params),
    refetchInterval: 30_000,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['alerts'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const acknowledge = useMutation({
    mutationFn: (alertId: number) => api.acknowledgeAlert(alertId),
    onSuccess: invalidate,
    onError: (error) => toast.error('Could not acknowledge', (error as ApiError).message),
  })

  const acknowledgeAll = useMutation({
    mutationFn: () => api.acknowledgeAllAlerts(),
    onSuccess: (result) => {
      toast.success(`${result.acknowledged} alerts acknowledged`)
      invalidate()
    },
    onError: (error) => toast.error('Could not acknowledge all', (error as ApiError).message),
  })

  const alerts = list.items
  const hasOpen = alerts.some((a) => !a.acknowledged)

  return (
    <div className="p-6">
      <PageHeader
        title="Alerts"
        subtitle="Conditions the system has flagged for review."
        meta={<MetaItem label="Total">{list.page.total}</MetaItem>}
        actions={
          <Button
            onClick={() => acknowledgeAll.mutate()}
            disabled={acknowledgeAll.isPending || !hasOpen}
          >
            {acknowledgeAll.isPending ? 'Clearing…' : 'Acknowledge all'}
          </Button>
        }
      />

      <Panel bodyClassName="overflow-visible">
        <div className="space-y-3 border-b border-line p-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search alert text"
            className="max-w-md"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={!severity} onClick={() => setSeverity(null)}>
              All severities
            </FilterChip>
            {SEVERITY_ORDER.map((option) => {
              const meta = SEVERITY[option]
              return (
                <FilterChip
                  key={option}
                  active={severity === option}
                  onClick={() => setSeverity(severity === option ? null : option)}
                  dot={meta.dot}
                >
                  {meta.label}
                </FilterChip>
              )
            })}
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <FilterChip
              active={showAcknowledged}
              onClick={() => setShowAcknowledged((v) => !v)}
            >
              Include acknowledged
            </FilterChip>
          </div>
        </div>

        {list.isInitialLoading ? (
          <Spinner label="Loading alerts" />
        ) : alerts.length === 0 ? (
          <EmptyState
            title="Nothing needs attention"
            hint="No alerts match this filter."
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {alerts.map((alert) => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  onAcknowledge={() => acknowledge.mutate(alert.id)}
                  acknowledging={
                    acknowledge.isPending && acknowledge.variables === alert.id
                  }
                />
              ))}
            </ul>
            <Pagination
              page={list.page}
              onPage={list.setPage}
              pageSize={list.pageSize}
              onPageSize={list.setPageSize}
              noun="alerts"
              busy={list.isPlaceholderData}
            />
          </>
        )}
      </Panel>
    </div>
  )
}
