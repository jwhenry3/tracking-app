import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/lib/types'

type WorkspaceFieldProps = {
  workspaces: Workspace[]
  value: number
  onChange?: (workspaceId: number) => void
  readOnly?: boolean
  workspaceName?: string
  className?: string
}

export function WorkspaceField({
  workspaces,
  value,
  onChange,
  readOnly = false,
  workspaceName,
  className,
}: WorkspaceFieldProps) {
  const resolvedName =
    workspaceName ?? workspaces.find((workspace) => workspace.id === value)?.name ?? 'Workspace'

  if (readOnly) {
    return (
      <div className={cn('space-y-2', className)}>
        <Label>Workspace</Label>
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{resolvedName}</div>
      </div>
    )
  }

  if (workspaces.length <= 1) {
    return null
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor="entry-workspace">Workspace</Label>
      <select
        id="entry-workspace"
        value={value}
        onChange={(event) => onChange?.(Number(event.target.value))}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
    </div>
  )
}
