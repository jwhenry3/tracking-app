import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { DayNotesEditor } from '@/components/notes/DayNotesEditor'
import { InlineCheckListItem } from '@/components/planner/InlineCheckListItem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createTodo } from '@/lib/api'
import { invalidatePlannerDay } from '@/lib/queries/invalidate'
import { usePlannerDayQuery } from '@/lib/queries/hooks'
import { cn } from '@/lib/utils'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'

type PlannerDayItemsSection = 'checklists' | 'notes' | 'all'

type PlannerDayItemsProps = {
  token: string
  workspaceId: number
  date: string
  showCheckLists?: boolean
  section?: PlannerDayItemsSection
}

export function PlannerDayItems({
  token,
  workspaceId,
  date,
  showCheckLists = true,
  section = 'all',
}: PlannerDayItemsProps) {
  const queryClient = useQueryClient()
  const { canManagePlanning } = useWorkspacePermissions()
  const [itemTitle, setItemTitle] = useState('')
  const dayQuery = usePlannerDayQuery(workspaceId, date)

  const dailyListId = dayQuery.data?.dailyListId ?? null
  const items = dayQuery.data?.items ?? []
  const notes = dayQuery.data?.notes ?? []
  const primaryNote = notes[0] ?? null

  async function refreshDayItems() {
    await invalidatePlannerDay(queryClient, workspaceId, date)
  }

  async function handleCreateItem(event: FormEvent) {
    event.preventDefault()
    if (!dailyListId || !itemTitle.trim()) return
    await createTodo(token, workspaceId, { list_id: dailyListId, title: itemTitle.trim() })
    setItemTitle('')
    await refreshDayItems()
  }

  if (dayQuery.isLoading && dailyListId === null) {
    return <p className="text-sm text-muted-foreground">Loading lists…</p>
  }

  const showCheckListSection = section !== 'notes'
  const showNotesSection = section !== 'checklists'

  return (
    <div className={cn(section === 'all' ? 'space-y-3 pt-2' : 'space-y-2')}>
      {showCheckListSection ? (
        showCheckLists ? (
          <div>
            {section === 'all' ? (
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Check list</p>
            ) : null}
            <div className="space-y-0.5">
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No items for this day.</p>
              ) : (
                items.map((item) => (
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
              <form onSubmit={(event) => void handleCreateItem(event)}>
                <div className="flex gap-1.5">
                  <Input
                    id={`checklist-item-${date}`}
                    value={itemTitle}
                    onChange={(event) => setItemTitle(event.target.value)}
                    placeholder="Add a check list item"
                    className="h-7 flex-1 text-sm"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0"
                    disabled={!dailyListId || !itemTitle.trim()}
                    aria-label="Add check list item"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </form>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Check list hidden for this day.</p>
        )
      ) : null}

      {showNotesSection && dailyListId ? (
        <div>
          {section === 'all' ? (
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
          ) : null}
          <DayNotesEditor
            token={token}
            workspaceId={workspaceId}
            listId={dailyListId}
            note={primaryNote}
            onSaved={() => void refreshDayItems()}
          />
        </div>
      ) : null}
    </div>
  )
}
