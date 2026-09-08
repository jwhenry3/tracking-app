import { resolveWorkspaceColor, type WorkspaceColorSource } from '@/lib/workspaceColors'
import { cn } from '@/lib/utils'

export function WorkspaceColorBadge({
  workspace,
  className,
}: {
  workspace: WorkspaceColorSource
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('h-2.5 w-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: resolveWorkspaceColor(workspace) }}
    />
  )
}
