import { createContext, useContext } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastInput {
  variant: ToastVariant
  message: string
}

export interface ConfirmInput {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export interface UiApi {
  toast: (input: ToastInput) => void
  confirm: (input: ConfirmInput) => Promise<boolean>
}

export const UiContext = createContext<UiApi | null>(null)

export function useUi(): UiApi {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi harus dipakai di dalam <UiProvider>')
  return ctx
}
