import clsx from 'clsx'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type Tone = 'success' | 'error' | 'info'

interface Toast {
  id: number
  tone: Tone
  title: string
  body?: string
}

interface ToastApi {
  push: (tone: Tone, title: string, body?: string) => void
  success: (title: string, body?: string) => void
  error: (title: string, body?: string) => void
}

const ToastContext = createContext<ToastApi>({
  push: () => {},
  success: () => {},
  error: () => {},
})

const ACCENT: Record<Tone, string> = {
  success: 'bg-st-available',
  error: 'bg-st-delayed',
  info: 'bg-brand',
}

const DURATION_MS = 6000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (tone: Tone, title: string, body?: string) => {
      const id = Date.now() + Math.random()
      setToasts((current) => [...current, { id, tone, title, body }].slice(-4))
      window.setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, body) => push('success', title, body),
      error: (title, body) => push('error', title, body),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[22rem] flex-col gap-2 sm:right-6 sm:bottom-6">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              style={{ animation: 'fade-up 160ms ease-out' }}
              className="pointer-events-auto flex gap-3 overflow-hidden rounded-lg border border-line bg-surface-1
                         shadow-[0_12px_32px_-8px_rgb(15_23_42/0.25)]"
            >
              {/* A colour bar carries the tone, so the text stays legible. */}
              <span className={clsx('w-1 shrink-0', ACCENT[toast.tone])} />
              <div className="min-w-0 flex-1 py-3 pr-2">
                <p className="text-sm font-semibold text-ink">{toast.title}</p>
                {toast.body && (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{toast.body}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="mt-2 mr-2 grid size-6 shrink-0 place-items-center self-start rounded text-ink-dim hover:bg-surface-2 hover:text-ink"
              >
                ×
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
