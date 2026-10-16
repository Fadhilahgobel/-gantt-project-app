import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { uid } from './ProjectProvider'
import {
  UiContext,
  type ConfirmInput,
  type ToastInput,
  type ToastVariant,
  type UiApi,
} from './uiContext'

interface ToastItem extends ToastInput {
  id: string
}

interface PendingConfirm extends ConfirmInput {
  resolve: (ok: boolean) => void
}

const ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 size={17} />,
  error: <XCircle size={17} />,
  info: <Info size={17} />,
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const timers = useRef<number[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      const id = uid('toast')
      setToasts((list) => [...list, { ...input, id }])
      const timer = window.setTimeout(() => dismiss(id), 3600)
      timers.current.push(timer)
    },
    [dismiss],
  )

  const confirm = useCallback((input: ConfirmInput) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...input, resolve })
    })
  }, [])

  const settle = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok)
      setPending(null)
    },
    [pending],
  )

  const value = useMemo<UiApi>(() => ({ toast, confirm }), [toast, confirm])

  return (
    <UiContext.Provider value={value}>
      {children}

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.variant}`}>
            <span className="toast__icon">{ICONS[t.variant]}</span>
            <span className="toast__msg">{t.message}</span>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={() => dismiss(t.id)}
              aria-label="Tutup notifikasi"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {pending && (
        <div
          className="overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) settle(false)
          }}
        >
          <div
            className="modal modal--sm"
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.title}
          >
            <div className="modal__head">
              <span className="stat__icon" aria-hidden>
                <AlertTriangle size={18} />
              </span>
              <h3>{pending.title}</h3>
            </div>
            <div className="modal__body">
              <p className="muted" style={{ fontSize: 13 }}>
                {pending.message}
              </p>
            </div>
            <div className="modal__foot">
              <button type="button" className="btn" onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'Batal'}
              </button>
              <button
                type="button"
                className={`btn ${pending.danger ? 'btn--danger' : 'btn--primary'}`}
                autoFocus
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? 'Ya, lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </UiContext.Provider>
  )
}
