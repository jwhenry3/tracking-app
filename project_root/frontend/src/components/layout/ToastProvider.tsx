import { AlertTriangle, CheckCircle2, Info, MessageSquare, X } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dismissToast } from '@/lib/toast'
import { useToastStore, type ToastItem, type ToastVariant } from '@/stores/toastStore'

function toastIcon(variant: ToastVariant) {
  switch (variant) {
    case 'success':
      return CheckCircle2
    case 'warning':
      return AlertTriangle
    case 'destructive':
      return AlertTriangle
    default:
      return Info
  }
}

function toastVariantClass(variant: ToastVariant) {
  switch (variant) {
    case 'success':
      return 'border-[#15803d]/30 bg-[#15803d]/8'
    case 'warning':
      return 'border-[#ca8a04]/35 bg-[#ca8a04]/10'
    case 'destructive':
      return 'border-[#dc2626]/35 bg-[#dc2626]/10'
    default:
      return 'border-border bg-card'
  }
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const Icon = toastIcon(toast.variant)

  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(toast.id), toast.duration)
    return () => window.clearTimeout(timer)
  }, [toast.id, toast.duration])

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto w-full rounded-xl border p-3 shadow-lg backdrop-blur-sm sm:w-[min(24rem,100%)]',
        toastVariantClass(toast.variant),
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            toast.variant === 'destructive' && 'text-[#dc2626]',
            toast.variant === 'warning' && 'text-[#ca8a04]',
            toast.variant === 'success' && 'text-[#15803d]',
            toast.variant === 'default' && 'text-primary',
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{toast.title}</p>
          {toast.description ? (
            <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">{toast.description}</p>
          ) : null}
          {toast.action ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-8"
              onClick={() => {
                toast.action?.onClick()
                dismissToast(toast.id)
              }}
            >
              {toast.action.label}
            </Button>
          ) : null}
        </div>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss notification"
          onClick={() => dismissToast(toast.id)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function ToastProvider() {
  const toasts = useToastStore((state) => state.toasts)

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-stretch gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-end sm:p-4"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

export { MessageSquare as ToastMessageIcon }
