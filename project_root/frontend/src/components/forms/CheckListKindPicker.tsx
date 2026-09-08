import { ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Label } from '@/components/ui/label'
import { CHECK_LIST_KIND_OPTIONS, type CheckListKind } from '@/lib/checklistListForm'
import { cn } from '@/lib/utils'

type CheckListKindPickerProps = {
  id: string
  label?: string
  value: CheckListKind
  onChange: (value: CheckListKind) => void
}

type MenuPosition = {
  top: number
  left: number
  width: number
  openUp: boolean
}

function portalContainerFor(trigger: HTMLElement | null) {
  return trigger?.closest('dialog') ?? document.body
}

function CheckListKindOptionLines({
  label,
  description,
}: {
  label: string
  description: string
}) {
  return (
    <>
      <span className="block text-sm font-medium">{label}</span>
      <span className="block text-xs text-muted-foreground">{description}</span>
    </>
  )
}

export function CheckListKindPicker({ id, label = 'List type', value, onChange }: CheckListKindPickerProps) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const selected =
    CHECK_LIST_KIND_OPTIONS.find((option) => option.value === value) ?? CHECK_LIST_KIND_OPTIONS[0]

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPosition(null)
      return
    }

    function updatePosition() {
      const trigger = triggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const gap = 4
      const estimatedMenuHeight = menuRef.current?.offsetHeight ?? 288
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < estimatedMenuHeight && rect.top > spaceBelow

      setMenuPosition({
        top: openUp ? rect.top - gap : rect.bottom + gap,
        left: rect.left,
        width: rect.width,
        openUp,
      })
    }

    updatePosition()
    const frame = requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape, true)
    }
  }, [open])

  const menu =
    open
      ? createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            aria-labelledby={id}
            style={
              menuPosition
                ? {
                    position: 'fixed',
                    top: menuPosition.top,
                    left: menuPosition.left,
                    width: menuPosition.width,
                    transform: menuPosition.openUp ? 'translateY(-100%)' : undefined,
                    zIndex: 1000,
                    visibility: 'visible',
                  }
                : {
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: triggerRef.current?.offsetWidth ?? 0,
                    zIndex: 1000,
                    visibility: 'hidden',
                  }
            }
            className="max-h-72 overflow-y-auto rounded-md border border-input bg-popover py-1 shadow-md"
          >
            {CHECK_LIST_KIND_OPTIONS.map((option) => {
              const isSelected = option.value === value
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      'w-full px-3 py-2 text-left hover:bg-muted/70',
                      isSelected && 'bg-primary/5',
                    )}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                  >
                    <CheckListKindOptionLines label={option.label} description={option.description} />
                  </button>
                </li>
              )
            })}
          </ul>,
          portalContainerFor(triggerRef.current),
        )
      : null

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left"
      >
        <span className="min-w-0">
          <CheckListKindOptionLines label={selected.label} description={selected.description} />
        </span>
        <ChevronDown
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {menu}
    </div>
  )
}
