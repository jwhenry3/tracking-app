import type { Workspace } from '@/lib/types'
import { workspaceHasFocus } from '@/lib/workspaceFocus'
import { canManageWorkspace } from '@/lib/workspacePermissions'

export type ManageTab = 'bills' | 'events' | 'expenses' | 'income'

export const MANAGE_TAB_LABELS: Record<ManageTab, string> = {
  bills: 'Bills',
  events: 'Events',
  expenses: 'Expenses',
  income: 'Income',
}

const MANAGE_TAB_ORDER: ManageTab[] = ['events', 'income', 'bills', 'expenses']

export function availableManageTabs(workspace: Workspace | undefined): ManageTab[] {
  const tabs = new Set<ManageTab>(['events'])
  if (workspaceHasFocus(workspace, 'finances') && canManageWorkspace(workspace, 'finances')) {
    tabs.add('income')
    tabs.add('bills')
    tabs.add('expenses')
  }
  return MANAGE_TAB_ORDER.filter((tab) => tabs.has(tab))
}

export function defaultManageTab(workspace: Workspace | undefined): ManageTab | null {
  return availableManageTabs(workspace)[0] ?? null
}

export function isManageTabAllowed(workspace: Workspace | undefined, tab: ManageTab): boolean {
  return availableManageTabs(workspace).includes(tab)
}
