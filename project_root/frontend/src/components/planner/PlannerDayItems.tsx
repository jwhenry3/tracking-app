import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { InlineCheckListItem } from '@/components/planner/InlineCheckListItem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createTodo } from '@/lib/api'
import { periodScopeLabel } from '@/lib/checklistPeriods'
import { invalidatePlannerDay } from '@/lib/queries/invalidate'
import { usePlannerDayQuery } from '@/lib/queries/hooks'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'

type PlannerDayItemsProps = {
  token: string
  workspaceId: number
  date: string
  showCheckLists?: boolean
}

export function PlannerDayItems({
  token,
  workspaceId,
  date,
  showCheckLists = true,
}: PlannerDayItemsProps) {
  const queryClient = useQueryClient()
  const { canManagePlanning } = useWorkspacePermissions()
  const [draftTitles, setDraftTitles] = useState<Record<number, string>>({})
  const dayQuery = usePlannerDayQuery(workspaceId, date)

  const taskLists = dayQuery.data?.dailyLists ?? []

  async function refreshDayItems() {
    await invalidatePlannerDay(queryClient, workspaceId, date)
  }

  async function handleCreateItem(event: FormEvent, listId: number) {
    event.preventDefault()
    const title = draftTitles[listId]?.trim()
    if (!title) return
    await createTodo(token, workspaceId, { list_id: listId, title })
    setDraftTitles((current) => ({ ...current, [listId]: '' }))
    await refreshDayItems()
  }

  if (dayQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading task lists…</p>
  }

  if (!showCheckLists) {
    return <p className="text-sm text-muted-foreground">Task list hidden for this day.</p>
  }

  if (taskLists.length === 0) {
    return <p className="text-xs text-muted-foreground">No task lists for this day.</p>
  }

  return (
    <div className="space-y-3 pt-2">
      {taskLists.map((list) => {
        const itemTitle = draftTitles[list.id] ?? ''
        const scopeLabel = list.periodScope ? periodScopeLabel(list.periodScope) : null
        const listLabel =
          scopeLabel && taskLists.length > 1 ? `${list.name} (${scopeLabel})` : list.name

        return (
          <div key={list.id}>
            {taskLists.length > 1 ? (
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {listLabel}
              </p>
            ) : (
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Task list
              </p>
            )}
            <div className="space-y-0.5">
              {list.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No items for this day.</p>
              ) : (
                list.items.map((item) => (
                  <InlineCheckListItem
                    key={item.id}
                    token={token}
                    workspaceId={workspaceId}
                    item={item}
                    compact
                    onChange={() => void refreshDayItems()}
                  />
                ))
              )}
              {canManagePlanning ? (
                <form onSubmit={(event) => void handleCreateItem(event, list.id)}>
                  <div className="flex gap-1.5">
                    <Input
                      id={`task-list-item-${date}-${list.id}`}
                      value={itemTitle}
                      onChange={(event) =>
                        setDraftTitles((current) => ({ ...current, [list.id]: event.target.value }))
                      }
                      placeholder="Add a task"
                      className="h-7 flex-1 text-sm"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0"
                      disabled={!itemTitle.trim()}
                      aria-label="Add task"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
