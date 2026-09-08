import type { Workspace, WorkspaceFocusArea } from '@/lib/types'

export const WORKSPACE_FOCUS_OPTIONS = [
  {
    id: 'planning' as const,
    label: 'Planning',
    description: 'Daily, weekly, and monthly planners plus todos and notes.',
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
    (relativePath === 'todos' || relativePath.startsWith('todos/') || relativePath.startsWith('planner/')) &&
    !workspaceHasFocus(workspace, 'planning')
  ) {
    return false
  }

  if (relativePath.startsWith('finances') && !workspaceHasFocus(workspace, 'finances')) {
    return false
  }

  return true
}
