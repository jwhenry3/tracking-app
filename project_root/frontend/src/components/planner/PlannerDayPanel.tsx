import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'

import { MaterialTabs } from '@/components/layout/MaterialTabs'
import { CheckListToggleButton } from '@/components/planner/CheckListToggleButton'
import { PlannerDayItems } from '@/components/planner/PlannerDayItems'
import { PlannerScheduleRow, type PlannerScheduleItem } from '@/components/planner/PlannerScheduleRow'
import type { EditableEntry } from '@/components/ops/EditEntryForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Bill, Expense } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'

type PlannerDayPanelTab = 'events' | 'checklists'

const plannerDayPanelTabs: Array<{ id: PlannerDayPanelTab; label: string }> = [
  { id: 'events', label: 'Events' },
  { id: 'checklists', label: 'Task list' },
]

type PlannerDayPanelProps = {
  day: string
  dayLabel: string
  dayItems: PlannerScheduleItem[]
  checkListsVisible: boolean
  token: string
  workspaceId: number
  scrollContent?: boolean
  sectionLayout?: 'stacked' | 'tabs'
  onToggleCheckLists: () => void
  onAdd?: () => void
  onClose?: () => void
  onEdit: (entry: EditableEntry) => void
  onPay: (bill: Bill) => void
  onPayExpense: (expense: Expense) => void
}

export function PlannerDayPanel({
  day,
  dayLabel,
  dayItems,
  checkListsVisible,
  token,
  workspaceId,
  scrollContent = false,
  sectionLayout = 'stacked',
  onToggleCheckLists,
  onAdd,
  onClose,
  onEdit,
  onPay,
  onPayExpense,
}: PlannerDayPanelProps) {
  const { canAddEntry } = useWorkspacePermissions()
  const [activeTab, setActiveTab] = useState<PlannerDayPanelTab>('events')

  useEffect(() => {
    setActiveTab('events')
  }, [day])

  const useTabs = sectionLayout === 'tabs'

  function renderEvents() {
    if (dayItems.length === 0) {
      return <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
    }

    return dayItems.map((item) => (
      <PlannerScheduleRow
        key={'occurrence_id' in item ? item.occurrence_id : `${item.kind}-${item.id}`}
        item={item}
        onEdit={onEdit}
        onPay={onPay}
        onPayExpense={onPayExpense}
      />
    ))
  }

  return (
    <Card className={cn(scrollContent && 'flex h-full min-h-0 flex-1 flex-col overflow-hidden')}>
      <CardHeader className={cn('space-y-0 pb-3', scrollContent && 'shrink-0')}>
        <div className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">{dayLabel}</CardTitle>
          <div className="flex items-center gap-1">
            {onClose ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                title="Close day"
                aria-label="Close day"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
            <CheckListToggleButton
              visible={checkListsVisible}
              label={dayLabel}
              onToggle={onToggleCheckLists}
            />
            {canAddEntry && onAdd ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Add entry"
              aria-label="Add entry"
              onClick={onAdd}
            >
              <Plus className="h-4 w-4" />
            </Button>
            ) : null}
          </div>
        </div>
        {useTabs ? (
          <MaterialTabs
            tabs={plannerDayPanelTabs}
            activeTab={activeTab}
            onChange={(tabId) => setActiveTab(tabId as PlannerDayPanelTab)}
            className="-mx-1 mt-3 border-b"
          />
        ) : null}
      </CardHeader>
      <CardContent
        className={cn(
          'space-y-2',
          scrollContent && 'min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]',
        )}
      >
        {useTabs ? (
          <>
            {activeTab === 'events' ? renderEvents() : null}
            {activeTab === 'checklists' ? (
              <PlannerDayItems
                token={token}
                workspaceId={workspaceId}
                date={day}
                showCheckLists={checkListsVisible}
              />
            ) : null}
          </>
        ) : (
          <>
            {renderEvents()}
            <PlannerDayItems
              token={token}
              workspaceId={workspaceId}
              date={day}
              showCheckLists={checkListsVisible}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
