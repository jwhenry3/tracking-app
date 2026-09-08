import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { OperationDialog } from '@/components/layout/OperationDialog'
import { InlineCheckListItem } from '@/components/planner/InlineCheckListItem'
import type { WeekCheckListItem } from '@/components/planner/CheckListChip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createTodo } from '@/lib/api'
import { formatDayLabel } from '@/lib/financeUtils'
import { invalidateCheckListTodos } from '@/lib/queries/invalidate'
import { useTodosQuery } from '@/lib/queries/hooks'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'

type PlannerCheckListDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: WeekCheckListItem | null
  token: string
  workspaceId: number
  plannerWeek?: { start: string; end: string }
}

export function PlannerCheckListDialog({
  open,
  onOpenChange,
  target,
  token,
  workspaceId,
  plannerWeek,
}: PlannerCheckListDialogProps) {
  const queryClient = useQueryClient()
  const { canManagePlanning } = useWorkspacePermissions()
  const [draftTitle, setDraftTitle] = useState('')
  const todosQuery = useTodosQuery(
    workspaceId,
    target?.listId ?? null,
    open && Boolean(target),
    target?.occurrence,
  )
  const items = todosQuery.data ?? []

  async function refreshDay() {
    if (!target) return
    await invalidateCheckListTodos(queryClient, workspaceId, {
      listId: target.listId,
      occurrence: target.occurrence,
      plannerWeek,
      plannerDay: plannerWeek ? undefined : target.day,
    })
  }

  async function handleCreateItem(event: FormEvent) {
    event.preventDefault()
    if (!target || !draftTitle.trim()) return
    await createTodo(token, workspaceId, { list_id: target.listId, title: draftTitle.trim() })
    setDraftTitle('')
    await refreshDay()
  }

  if (!target) return null

  return (
    <OperationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={target.name}
      description={formatDayLabel(target.day)}
      className="max-w-lg"
    >
      <div className="space-y-3">
        {todosQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading tasks…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks in this list.</p>
        ) : (
          <div className="space-y-0.5">
            {items.map((item) => (
              <InlineCheckListItem
                key={item.id}
                token={token}
                workspaceId={workspaceId}
                item={item}
                occurrence={target.occurrence ?? undefined}
                onChange={() => void refreshDay()}
              />
            ))}
          </div>
        )}

        {canManagePlanning ? (
          <form className="flex gap-2 border-t pt-3" onSubmit={(event) => void handleCreateItem(event)}>
            <Input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="Add a task"
            />
            <Button type="submit" disabled={!draftTitle.trim()}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </form>
        ) : null}
      </div>
    </OperationDialog>
  )
}
