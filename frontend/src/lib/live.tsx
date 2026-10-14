import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * One WebSocket for the whole app. The server pushes assignment, trip and
 * alert events; this provider turns them into React Query invalidations so a
 * change made by another operator shows up here without a manual refresh.
 */
interface LiveState {
  connected: boolean
  lastEventAt: number | null
}

const LiveContext = createContext<LiveState>({ connected: false, lastEventAt: null })

const RECONNECT_BASE_MS = 1200
const RECONNECT_MAX_MS = 15000
/** Several events often land together; batch the refetches they trigger. */
const INVALIDATE_DEBOUNCE_MS = 600

export function LiveProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)

  const pendingKeys = useRef(new Set<string>())
  const flushTimer = useRef<number | undefined>(undefined)

  const invalidate = useCallback(
    (keys: string[]) => {
      keys.forEach((key) => pendingKeys.current.add(key))
      if (flushTimer.current !== undefined) return
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = undefined
        const keys = Array.from(pendingKeys.current)
        pendingKeys.current.clear()
        keys.forEach((key) => {
          void queryClient.invalidateQueries({ queryKey: [key] })
        })
      }, INVALIDATE_DEBOUNCE_MS)
    },
    [queryClient],
  )

  useEffect(() => {
    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let keepAlive: number | undefined
    let attempt = 0
    let disposed = false

    const connect = () => {
      if (disposed) return
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(`${scheme}://${window.location.host}/ws/fleet`)

      socket.onopen = () => {
        attempt = 0
        setConnected(true)
        // Some proxies drop idle sockets; a periodic ping keeps it warm.
        keepAlive = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send('ping')
        }, 25000)
      }

      socket.onmessage = (raw) => {
        setLastEventAt(Date.now())
        let message: { event: string }
        try {
          message = JSON.parse(raw.data as string)
        } catch {
          return
        }

        switch (message.event) {
          case 'assignment':
            invalidate(['board', 'trucks', 'truck', 'orders', 'order', 'dashboard', 'trips'])
            break
          // A billing party placed an order through the portal.
          case 'order_placed':
            invalidate(['orders', 'board', 'dashboard'])
            break
          case 'alert':
            invalidate(['alerts', 'dashboard'])
            break
          case 'trip_started':
          case 'trip_completed':
          case 'trip_cancelled':
          case 'stop_completed':
            invalidate(['trips', 'trip', 'trucks', 'truck', 'dashboard', 'orders', 'board'])
            break
          case 'truck_status':
            invalidate(['trucks', 'truck', 'dashboard', 'board'])
            break
          default:
            break
        }
      }

      const scheduleReconnect = () => {
        setConnected(false)
        if (keepAlive) window.clearInterval(keepAlive)
        if (disposed) return
        attempt += 1
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS)
        reconnectTimer = window.setTimeout(connect, delay)
      }

      socket.onclose = scheduleReconnect
      socket.onerror = () => socket?.close()
    }

    connect()

    return () => {
      disposed = true
      if (keepAlive) window.clearInterval(keepAlive)
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      if (flushTimer.current !== undefined) window.clearTimeout(flushTimer.current)
      socket?.close()
    }
  }, [invalidate])

  const value = useMemo<LiveState>(
    () => ({ connected, lastEventAt }),
    [connected, lastEventAt],
  )

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export function useLive(): LiveState {
  return useContext(LiveContext)
}
