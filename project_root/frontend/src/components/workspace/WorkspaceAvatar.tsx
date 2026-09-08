import { resolveWorkspaceColor, workspaceInitials, type WorkspaceColorSource } from '@/lib/workspaceColors'
import { cn } from '@/lib/utils'

type WorkspaceAvatarProps = {
  workspace: WorkspaceColorSource & { name: string }
  active?: boolean
  compact?: boolean
  className?: string
}

export function WorkspaceAvatar({
  workspace,
  active = false,
  compact = false,
  className,
}: WorkspaceAvatarProps) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-2xl text-sm font-semibold text-white transition hover:brightness-110',
        compact ? 'h-10 w-10' : 'h-11 w-11',
        active && 'ring-2 ring-white ring-offset-2 ring-offset-[#1a1d21]',
        className,
      )}
      style={{ backgroundColor: resolveWorkspaceColor(workspace) }}
    >
      {workspaceInitials(workspace.name)}
    </span>
  )
}
