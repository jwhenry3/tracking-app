import { Settings2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { MaterialTabs } from '@/components/layout/MaterialTabs'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  availableManageTabs,
  isManageTabAllowed,
  MANAGE_TAB_LABELS,
  type ManageTab,
} from '@/lib/manageTabs'
import { cn } from '@/lib/utils'
import { usePrefetchManageQueries, useWorkspaceParams } from '@/lib/queries/hooks'
import { useAuthStore } from '@/stores/authStore'
import { ManageBillsPanel } from '@/views/manage/ManageBillsPanel'
import { ManageEventsPanel } from '@/views/manage/ManageEventsPanel'
import { ManageExpensesPanel } from '@/views/manage/ManageExpensesPanel'

export function ManageView({ tab }: { tab: ManageTab }) {
  const navigate = useNavigate()
  const { workspaceId } = useParams()
  const { enabled } = useWorkspaceParams()
  const workspaces = useAuthStore((state) => state.workspaces)
  const workspace = workspaces.find((item) => item.id === Number(workspaceId))

  const visibleTabs = useMemo(
    () =>
      availableManageTabs(workspace).map((id) => ({
        id,
        label: MANAGE_TAB_LABELS[id],
      })),
    [workspace],
  )

  const showBills = isManageTabAllowed(workspace, 'bills')
  const showEvents = isManageTabAllowed(workspace, 'events')
  const showExpenses = isManageTabAllowed(workspace, 'expenses')

  usePrefetchManageQueries(workspace?.id ?? null, enabled, {
    bills: showBills,
    events: showEvents,
    expenses: showExpenses,
  })

  useEffect(() => {
    if (!workspaceId || visibleTabs.length === 0) return
    if (!visibleTabs.some((item) => item.id === tab)) {
      navigate(`/w/${workspaceId}/manage/${visibleTabs[0].id}`, { replace: true })
    }
  }, [tab, visibleTabs, workspaceId, navigate])

  function switchTab(nextTab: ManageTab) {
    navigate(`/w/${workspaceId}/manage/${nextTab}`)
  }

  const subtitle =
    showBills || showExpenses
      ? 'Edit events, bills, and expenses'
      : 'Edit events'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader icon={Settings2} title="Manage" subtitle={subtitle} />

      <div className="border-b px-4 py-3">
        <MaterialTabs
          activeTab={tab}
          onChange={(value) => switchTab(value as ManageTab)}
          tabs={visibleTabs}
        />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {showEvents ? (
          <div className={cn('flex min-h-0 flex-1 flex-col', tab !== 'events' && 'hidden')}>
            <ManageEventsPanel />
          </div>
        ) : null}
        {showBills ? (
          <div className={cn('flex min-h-0 flex-1 flex-col', tab !== 'bills' && 'hidden')}>
            <ManageBillsPanel />
          </div>
        ) : null}
        {showExpenses ? (
          <div className={cn('flex min-h-0 flex-1 flex-col', tab !== 'expenses' && 'hidden')}>
            <ManageExpensesPanel />
          </div>
        ) : null}
      </div>
    </div>
  )
}
