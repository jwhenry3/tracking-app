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
  const backdropPointerDown = useRef(false)
  const closeReason = useRef<'backdrop' | 'escape' | 'programmatic' | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      closeReason.current = 'programmatic'
      dialog.close()
    }
  }, [open])

  function requestClose(reason: 'backdrop' | 'escape') {
    closeReason.current = reason
    onOpenChange(false)
  }

  return (
    <dialog
      ref={ref}
      closedby="none"
      className={cn(
        'fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-4 open:flex open:items-center open:justify-center backdrop:bg-black/40',
        className,
      )}
      onClose={() => {
        if (closeReason.current === 'programmatic') {
          closeReason.current = null
          return
        }

        if (closeReason.current === 'backdrop' || closeReason.current === 'escape') {
          closeReason.current = null
          onOpenChange(false)
          return
        }

        // Browsers without closedBy="none" can still close on backdrop mouseup after a drag.
        if (open) {
          requestAnimationFrame(() => ref.current?.showModal())
        }
      }}
      onPointerDown={(event) => {
        backdropPointerDown.current = event.target === ref.current
      }}
      onPointerUp={(event) => {
        if (backdropPointerDown.current && event.target === ref.current) {
          requestClose('backdrop')
        }
        backdropPointerDown.current = false
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          requestClose('escape')
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
    >
      {children}
    </div>
  )
}
