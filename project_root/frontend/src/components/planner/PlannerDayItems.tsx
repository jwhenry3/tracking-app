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
  const [draftTitles, setDraftTitles] = useState<Record<number, string>>({})
  const dayQuery = usePlannerDayQuery(workspaceId, date)

  const dailyLists = dayQuery.data?.dailyLists ?? []
  const hasLoadedLists = dailyLists.length > 0 || dayQuery.data?.dailyListId != null

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

  if (dayQuery.isLoading && !hasLoadedLists) {
    return <p className="text-sm text-muted-foreground">Loading lists…</p>
  }

  const showCheckListSection = section !== 'notes'
  const showNotesSection = section !== 'checklists'

  function renderCheckList(list: (typeof dailyLists)[number]) {
    const itemTitle = draftTitles[list.id] ?? ''
    return (
      <div key={list.id}>
        {dailyLists.length > 1 ? (
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {list.name}
          </p>
        ) : section === 'all' ? (
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Check list</p>
        ) : null}
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
                  id={`checklist-item-${date}-${list.id}`}
                  value={itemTitle}
                  onChange={(event) =>
                    setDraftTitles((current) => ({ ...current, [list.id]: event.target.value }))
                  }
                  placeholder="Add a check list item"
                  className="h-7 flex-1 text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0"
                  disabled={!itemTitle.trim()}
                  aria-label="Add check list item"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    )
  }

  function renderNotes(list: (typeof dailyLists)[number]) {
    const primaryNote = list.notes[0] ?? null
    return (
      <div key={`notes-${list.id}`}>
        {dailyLists.length > 1 ? (
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {list.name} notes
          </p>
        ) : section === 'all' ? (
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
        ) : null}
        <DayNotesEditor
          token={token}
          workspaceId={workspaceId}
          listId={list.id}
          note={primaryNote}
          onSaved={() => void refreshDayItems()}
        />
      </div>
    )
  }

  const noteLists = dailyLists.filter((list) => list.notes.length > 0 || dailyLists.length === 1)
  const notesTargetLists = noteLists.length > 0 ? noteLists : dailyLists.slice(0, 1)

  return (
    <div className={cn(section === 'all' ? 'space-y-3 pt-2' : 'space-y-2')}>
      {showCheckListSection ? (
        showCheckLists ? (
          dailyLists.length > 0 ? (
            <div className="space-y-3">
              {dailyLists.map((list) => renderCheckList(list))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No check lists for this day.</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Check list hidden for this day.</p>
        )
      ) : null}

      {showNotesSection && notesTargetLists.length > 0 ? (
        <div className="space-y-3">
          {notesTargetLists.map((list) => renderNotes(list))}
        </div>
      ) : null}
    </div>
  )
}
