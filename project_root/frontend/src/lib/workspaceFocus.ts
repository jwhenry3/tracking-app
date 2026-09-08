import type { Workspace, WorkspaceFocusArea } from '@/lib/types'

export const WORKSPACE_FOCUS_OPTIONS = [
  {
    id: 'planning' as const,
    label: 'Planning',
    description: 'Daily and weekly planners plus check lists and notes.',
  },
  {
    id: 'finances' as const,
    label: 'Finances',
    description: 'Income runway, timeline, and analytics.',
  },
]

export function defaultWorkspaceFocusAreas(): WorkspaceFocusArea[] {
  return ['planning', 'finances']
}

export function workspaceHasFocus(
  workspace: Workspace | undefined,
  area: WorkspaceFocusArea,
): boolean {
  if (!workspace?.focus_areas?.length) {
    return true
  }
  return workspace.focus_areas.includes(area)
}

export function isWorkspaceRouteAllowed(
  pathname: string,
  workspaceId: string,
  workspace: Workspace | undefined,
): boolean {
  const basePath = `/w/${workspaceId}/`
  if (!pathname.startsWith(basePath)) {
    return true
  }

  const relativePath = pathname.slice(basePath.length)

  if (
    (relativePath === 'check-lists' ||
      relativePath.startsWith('check-lists/') ||
      relativePath === 'todos' ||
      relativePath.startsWith('todos/') ||
      relativePath.startsWith('planner/')) &&
    !workspaceHasFocus(workspace, 'planning')
  ) {
    return false
  }

  if (relativePath.startsWith('finances') && !workspaceHasFocus(workspace, 'finances')) {
    return false
  }

  if (
    (relativePath === 'manage/bills' ||
      relativePath.startsWith('manage/bills/') ||
      relativePath === 'manage/expenses' ||
      relativePath.startsWith('manage/expenses/') ||
      relativePath === 'finances/manage/bills' ||
      relativePath.startsWith('finances/manage/bills/') ||
      relativePath === 'finances/manage/expenses' ||
      relativePath.startsWith('finances/manage/expenses/')) &&
    !workspaceHasFocus(workspace, 'finances')
  ) {
    return false
  }

  return true
}
