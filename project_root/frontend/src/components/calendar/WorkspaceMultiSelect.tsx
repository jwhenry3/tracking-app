import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { centralCalendarWorkspaceFilterLabel } from '@/lib/centralCalendarWorkspaceFilter'
import type { Workspace } from '@/lib/types'
import { cn } from '@/lib/utils'

type WorkspaceMultiSelectProps = {
  workspaces: Workspace[]
  selectedIds: number[]
  onChange: (workspaceIds: number[]) => void
  className?: string
}

export function WorkspaceMultiSelect({
  workspaces,
  selectedIds,
  onChange,
  className,
}: WorkspaceMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (workspaces.length === 0) {
    return null
  }

  const label = centralCalendarWorkspaceFilterLabel(selectedIds, workspaces)
  const allSelected = selectedIds.length === workspaces.length

  function toggleWorkspace(workspaceId: number) {
    if (selectedIds.includes(workspaceId)) {
      if (selectedIds.length <= 1) return
      onChange(selectedIds.filter((id) => id !== workspaceId))
      return
    }

    onChange([...selectedIds, workspaceId].sort((a, b) => a - b))
  }

  function selectAll() {
    onChange(workspaces.map((workspace) => workspace.id))
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'inline-flex h-9 min-w-[11rem] max-w-[14rem] items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm transition hover:bg-muted/40',
          open && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        )}
      >
        <span className="truncate text-left">{label}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute right-0 top-full z-50 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-input bg-popover p-2 shadow-md"
        >
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspaces</p>
            {!allSelected ? (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={selectAll}
              >
                Select all
              </button>
            ) : null}
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {workspaces.map((workspace) => {
              const checked = selectedIds.includes(workspace.id)
              return (
                <label
                  key={workspace.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleWorkspace(workspace.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="truncate">{workspace.name}</span>
                </label>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
