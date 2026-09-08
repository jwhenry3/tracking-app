import type { Workspace } from '@/lib/types'
import { cn } from '@/lib/utils'
import { WorkspaceColorBadge } from '@/components/workspace/WorkspaceColorBadge'

type WorkspaceChecklistProps = {
  workspaces: Workspace[]
  selectedIds: number[]
  onToggle: (workspaceId: number) => void
  onSelectAll?: () => void
  className?: string
}

export function WorkspaceChecklist({
  workspaces,
  selectedIds,
  onToggle,
  onSelectAll,
  className,
}: WorkspaceChecklistProps) {
  if (workspaces.length === 0) {
    return <p className="px-1 text-sm text-muted-foreground">No workspaces yet.</p>
  }

  const allSelected = selectedIds.length === workspaces.length

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspaces</p>
        {onSelectAll && !allSelected ? (
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={onSelectAll}
          >
            Select all
          </button>
        ) : null}
      </div>
      <div className="space-y-1">
        {workspaces.map((workspace) => {
          const checked = selectedIds.includes(workspace.id)
          return (
            <label
              key={workspace.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(workspace.id)}
                className="h-4 w-4 rounded border-input"
              />
              <WorkspaceColorBadge workspace={workspace} />
              <span className="truncate">{workspace.name}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
