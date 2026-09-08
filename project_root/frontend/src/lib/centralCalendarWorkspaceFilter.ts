const STORAGE_KEY = 'central-calendar-workspaces'

export function defaultCentralCalendarWorkspaceFilter(workspaceIds: number[]): number[] {
  return [...workspaceIds]
}

export function loadCentralCalendarWorkspaceFilter(workspaceIds: number[]): number[] {
  if (typeof window === 'undefined') {
    return defaultCentralCalendarWorkspaceFilter(workspaceIds)
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultCentralCalendarWorkspaceFilter(workspaceIds)

    const parsed = JSON.parse(raw) as number[]
    if (!Array.isArray(parsed)) return defaultCentralCalendarWorkspaceFilter(workspaceIds)

    const allowed = new Set(workspaceIds)
    const next = parsed.filter((id) => allowed.has(id))
    return next.length > 0 ? next : defaultCentralCalendarWorkspaceFilter(workspaceIds)
  } catch {
    return defaultCentralCalendarWorkspaceFilter(workspaceIds)
  }
}

export function saveCentralCalendarWorkspaceFilter(workspaceIds: number[]) {
  if (workspaceIds.length === 0) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaceIds))
}

export function toggleCentralCalendarWorkspace(
  selectedIds: number[],
  workspaceId: number,
): number[] {
  if (selectedIds.includes(workspaceId)) {
    if (selectedIds.length <= 1) return selectedIds
    return selectedIds.filter((id) => id !== workspaceId)
  }

  return [...selectedIds, workspaceId].sort((a, b) => a - b)
}

export function centralCalendarWorkspaceFilterLabel(
  selectedIds: number[],
  workspaces: Array<{ id: number; name: string }>,
): string {
  if (selectedIds.length === 0 || selectedIds.length === workspaces.length) {
    return 'All workspaces'
  }

  if (selectedIds.length === 1) {
    return workspaces.find((workspace) => workspace.id === selectedIds[0])?.name ?? '1 workspace'
  }

  return `${selectedIds.length} workspaces`
}
