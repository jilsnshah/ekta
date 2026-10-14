/** One page of results, as every list endpoint returns it. */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
  has_next: boolean
  has_previous: boolean
}

export const DEFAULT_PAGE_SIZE = 25

/** An empty page, for rendering before the first response arrives. */
export function emptyPage<T>(pageSize = DEFAULT_PAGE_SIZE): Page<T> {
  return {
    items: [],
    total: 0,
    page: 1,
    page_size: pageSize,
    pages: 0,
    has_next: false,
    has_previous: false,
  }
}

/** The 1-based range shown, for "Showing 26–50 of 1,284". */
export function pageRange(page: Page<unknown>): { from: number; to: number } {
  if (page.total === 0) return { from: 0, to: 0 }
  const from = (page.page - 1) * page.page_size + 1
  return { from, to: Math.min(from + page.items.length - 1, page.total) }
}
