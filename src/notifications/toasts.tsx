// Brief pop-ups for new leads (AC-11.3). Not a live region: the inbox already announces a new lead
// (AC-5.1), and saying it twice is noise. A toast never takes focus, and hovering or focusing it
// holds it on screen.
import { X } from 'lucide-react'
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { LeadId } from '../contract.ts'

export const TOAST_MS = 8_000

export interface Toast {
  id: string
  title: string
  detail: string
  leadId: LeadId
}

const ToastContext = createContext<(toast: Toast) => void>(() => {})

export const useShowToast = () => use(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  // At most three at once: a burst of leads shouldn't cover the screen.
  const show = useCallback((toast: Toast) => setToasts((t) => [...t.filter((x) => x.id !== toast.id), toast].slice(-3)), [])
  const value = useMemo(() => show, [show])
  return (
    <ToastContext value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} dismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext>
  )
}

function ToastCard({ toast, dismiss }: { toast: Toast; dismiss: (id: string) => void }) {
  const [held, setHeld] = useState(false)
  const onDismiss = () => dismiss(toast.id)

  useEffect(() => {
    if (held) return
    const timer = setTimeout(() => dismiss(toast.id), TOAST_MS)
    return () => clearTimeout(timer)
  }, [held, dismiss, toast.id])

  return (
    <div className="toast" role="group" aria-label={toast.title}
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      <div className="toast__text">
        <p className="toast__title">{toast.title}</p>
        <p className="meta">{toast.detail}</p>
      </div>
      <Link to={`/leads/${toast.leadId}`} className="button button--secondary button--small" onClick={onDismiss}>
        Open
      </Link>
      <button type="button" className="toast__close" aria-label={`Dismiss ${toast.title}`} onClick={onDismiss}>
        <X aria-hidden size={16} />
      </button>
    </div>
  )
}
