import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'

import type { Workspace, WorkspaceFocusArea } from '@/lib/types'
import { workspaceHasFocus } from '@/lib/workspaceFocus'
import { useAuthStore } from '@/stores/authStore'

export function canManageWorkspace(
  workspace: Workspace | undefined,
  area: WorkspaceFocusArea,
): boolean {
  if (!workspace || !workspaceHasFocus(workspace, area)) {
    return false
  }
  if (workspace.role === 'owner') {
    return true
  }
  return workspace.manage_areas?.includes(area) ?? false
}

export function useCurrentWorkspace() {
  const { workspaceId } = useParams()
  const workspaces = useAuthStore((state) => state.workspaces)
  return workspaces.find((workspace) => workspace.id === Number(workspaceId))
}

export function useWorkspacePermissions() {
  const workspace = useCurrentWorkspace()
  const canManagePlanning = canManageWorkspace(workspace, 'planning')
  const canManageFinances = canManageWorkspace(workspace, 'finances')

  return {
    workspace,
    isOwner: workspace?.role === 'owner',
    canManagePlanning,
    canManageFinances,
    canAddEntry: canManagePlanning || canManageFinances,
  }
}

export function ManageActions({
  area,
  children,
}: {
  area: WorkspaceFocusArea
  children: ReactNode
}) {
  const { workspace } = useWorkspacePermissions()
  if (!canManageWorkspace(workspace, area)) {
    return null
  }
  return children
}
