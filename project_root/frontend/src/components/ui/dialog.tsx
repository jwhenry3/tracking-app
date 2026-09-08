import { useEffect, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  className?: string
}

export function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-4 open:flex open:items-center open:justify-center backdrop:bg-black/40',
        className,
      )}
      onClose={() => onOpenChange(false)}
      onClick={(event) => {
        if (event.target === ref.current) {
          onOpenChange(false)
        }
      }}
    >
      {children}
    </dialog>
  )
}

type DialogContentProps = {
  children: ReactNode
  className?: string
}

export function DialogContent({ children, className }: DialogContentProps) {
  return (
    <div
      className={cn(
        'relative flex max-h-[min(90vh,760px)] w-full flex-col overflow-hidden rounded-lg border bg-background shadow-xl',
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  )
}
