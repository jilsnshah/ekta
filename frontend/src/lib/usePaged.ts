import { useCallback, useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { DEFAULT_PAGE_SIZE, emptyPage, type Page } from './paging'

/**
 * State for one paged, server-filtered list.
 *
 * Search and filters are sent to the server, never applied to the rows on
 * screen: narrowing a single page in the browser would quietly miss
 * everything on the others. Changing any of them resets to page 1, because
 * staying on page 7 of a different result set is meaningless.
 *
 * `keepPreviousData` holds the old page visible while the next one loads, so
 * paging does not flash an empty table.
 */
export function usePaged<T, F extends object>({
  key,
  fetchPage,
  filters,
  pageSize = DEFAULT_PAGE_SIZE,
  refetchInterval,
}: {
  /** Query key prefix; the page and filters are appended automatically. */
  key: unknown[]
  fetchPage: (params: F & { page: number; page_size: number }) => Promise<Page<T>>
  filters: F
  pageSize?: number
  refetchInterval?: number
}) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(pageSize)

  // Any change of filter invalidates the current position.
  const fingerprint = JSON.stringify(filters)
  const previous = useRef(fingerprint)
  useEffect(() => {
    if (previous.current !== fingerprint) {
      previous.current = fingerprint
      setPage(1)
    }
  }, [fingerprint])

  const query = useQuery({
    queryKey: [...key, fingerprint, page, size],
    queryFn: () => fetchPage({ ...filters, page, page_size: size }),
    placeholderData: keepPreviousData,
    refetchInterval,
  })

  const data = query.data ?? emptyPage<T>(size)

  const setPageSize = useCallback((next: number) => {
    setSize(next)
    setPage(1)
  }, [])

  return {
    ...query,
    page: data,
    items: data.items,
    pageNumber: page,
    setPage,
    pageSize: size,
    setPageSize,
    /** True only on the very first load, not while paging. */
    isInitialLoading: query.isLoading && !query.isPlaceholderData,
  }
}
