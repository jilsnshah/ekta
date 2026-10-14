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
import { IconAlert, IconCheck, IconClose, IconInfo } from './icons'

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
        // Top of the screen on a phone, where no tab bar or sticky action can
        // cover it; bottom right on a desk, out of the way of the work.
        <div className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col gap-2 sm:inset-x-auto sm:top-auto sm:right-6 sm:bottom-6 sm:w-[24rem]">
          {toasts.map((toast) => {
            const Icon = toast.tone === 'error' ? IconAlert : toast.tone === 'success' ? IconCheck : IconInfo
            return (
              <div
                key={toast.id}
                role="status"
                className="pointer-events-auto flex animate-pop items-start gap-3 rounded-xl bg-night px-4 py-3.5 text-on-night shadow-overlay ring-1 ring-white/10"
              >
                <span
                  className={clsx(
                    'mt-px grid size-6 shrink-0 place-items-center rounded-full',
                    ACCENT[toast.tone],
                  )}
                >
                  <Icon size={14} strokeWidth={2.2} className="text-white" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.body && (
                    <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-on-night-dim">
                      {toast.body}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss"
                  className="-mt-0.5 -mr-1.5 grid size-7 shrink-0 place-items-center rounded-md text-on-night-dim hover:bg-white/10 hover:text-on-night"
                >
                  <IconClose size={14} />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
