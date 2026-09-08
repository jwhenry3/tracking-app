import { create } from 'zustand'

export type ToastVariant = 'default' | 'success' | 'warning' | 'destructive'

export type ToastAction = {
  label: string
  onClick: () => void
}

export type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  duration: number
  action?: ToastAction
  createdAt: number
}

export type ToastInput = {
  id?: string
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
  action?: ToastAction
}

type ToastState = {
  toasts: ToastItem[]
  push: (toast: ToastInput) => string
  dismiss: (id: string) => void
  clear: () => void
}

let nextToastId = 0

function createToastId(explicitId?: string) {
  return explicitId ?? `toast-${++nextToastId}`
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = createToastId(toast.id)
    const item: ToastItem = {
      id,
      title: toast.title,
      description: toast.description,
      variant: toast.variant ?? 'default',
      duration: toast.duration ?? 6000,
      action: toast.action,
      createdAt: Date.now(),
    }

    set((state) => ({
      toasts: [...state.toasts.filter((existing) => existing.id !== id), item].slice(-5),
    }))

    return id
  },
  dismiss: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }))
  },
  clear: () => set({ toasts: [] }),
}))
