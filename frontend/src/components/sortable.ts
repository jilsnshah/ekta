import { useCallback, useState, type DragEvent } from 'react'
import { startedOnInteractive } from './ui'

/** Own MIME type, so a stop drag is never confused with an order-card drag. */
const SORTABLE_MIME = 'application/x-fleetops-sortable'

export interface SortableItemProps {
  draggable: boolean
  onDragStart: (event: DragEvent) => void
  onDragOver: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
  onDragEnd: () => void
}

/**
 * Drag-to-reorder for a vertical list, using native HTML5 drag and drop so
 * there is no extra dependency.
 *
 * Dragging is suppressed when the gesture starts on a button or link, so the
 * controls inside a row keep working. `isLocked` marks rows that can neither
 * be dragged nor dropped onto -- completed stops, in practice.
 *
 * Reordering stays available from the keyboard through the up/down controls
 * each row renders; drag is the pointer shortcut, not the only route.
 */
export function useSortable({
  onMove,
  isLocked,
}: {
  /** Move the item at `from` to index `to`. */
  onMove: (from: number, to: number) => void
  isLocked?: (index: number) => boolean
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const reset = useCallback(() => {
    setDragIndex(null)
    setOverIndex(null)
  }, [])

  const itemProps = useCallback(
    (index: number): SortableItemProps => {
      const locked = isLocked?.(index) ?? false
      return {
        draggable: !locked,
        onDragStart: (event) => {
          if (locked || startedOnInteractive(event.target)) {
            event.preventDefault()
            return
          }
          setDragIndex(index)
          // Firefox will not start a drag unless some data is set.
          event.dataTransfer.setData(SORTABLE_MIME, String(index))
          event.dataTransfer.effectAllowed = 'move'
        },
        onDragOver: (event) => {
          if (dragIndex === null || locked) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          if (overIndex !== index) setOverIndex(index)
        },
        onDrop: (event) => {
          if (dragIndex === null || locked) return
          event.preventDefault()
          if (dragIndex !== index) onMove(dragIndex, index)
          reset()
        },
        onDragEnd: reset,
      }
    },
    [dragIndex, overIndex, isLocked, onMove, reset],
  )

  /** Where to draw the insertion line for the row at `index`. */
  const indicator = useCallback(
    (index: number): 'above' | 'below' | null => {
      if (dragIndex === null || overIndex !== index || dragIndex === index) return null
      return overIndex > dragIndex ? 'below' : 'above'
    },
    [dragIndex, overIndex],
  )

  return {
    dragIndex,
    itemProps,
    indicator,
    isDragging: dragIndex !== null,
  }
}

/** Pure helper: a copy of `items` with one entry moved. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items
  }
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
