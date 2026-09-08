import { useEffect, useMemo, useState } from 'react'

import type { WorkspaceFocusArea } from '@/lib/types'
import { getManageableWorkspaces } from '@/lib/workspacePermissions'
import { useAuthStore } from '@/stores/authStore'

export function useCreateWorkspaceSelection(defaultWorkspaceId: number, area: WorkspaceFocusArea) {
  const workspaces = useAuthStore((state) => state.workspaces)
  const creatableWorkspaces = useMemo(
    () => getManageableWorkspaces(workspaces, area),
    [workspaces, area],
  )
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(defaultWorkspaceId)

  useEffect(() => {
    setSelectedWorkspaceId(defaultWorkspaceId)
  }, [defaultWorkspaceId])

  useEffect(() => {
    if (creatableWorkspaces.some((workspace) => workspace.id === selectedWorkspaceId)) return
    setSelectedWorkspaceId(creatableWorkspaces[0]?.id ?? defaultWorkspaceId)
  }, [creatableWorkspaces, selectedWorkspaceId, defaultWorkspaceId])

  return {
    creatableWorkspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
  }
}
