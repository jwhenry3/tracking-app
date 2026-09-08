import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { CheckSquare, Plus } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { FormField } from '@/components/forms/FormField'
import { OperationDialog, OpsTabs } from '@/components/layout/OperationDialog'
import { PageHeader, PageHeaderIconButton } from '@/components/layout/PageHeader'
import { InlineNoteEditor } from '@/components/notes/InlineNoteEditor'
import { InlineCheckListItem } from '@/components/planner/InlineCheckListItem'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createTodo, createTodoList } from '@/lib/api'
import { invalidateCheckLists } from '@/lib/queries/invalidate'
import {
  useDailyListQuery,
  useNotesQuery,
  useTodoListsQuery,
  useTodosQuery,
} from '@/lib/queries/hooks'
import { cn } from '@/lib/utils'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'
import { useAuthStore } from '@/stores/authStore'

type CheckListTab = 'item' | 'list'

export function CheckListsView() {
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
  const { canManagePlanning } = useWorkspacePermissions()
  const queryClient = useQueryClient()
  const workspaceNumericId = workspaceId ? Number(workspaceId) : null
  const queriesEnabled = Boolean(token && workspaceNumericId)

  const today = new Date().toISOString().slice(0, 10)
  const [activeListId, setActiveListId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<CheckListTab>('item')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [itemTitle, setItemTitle] = useState('')
  const [newListName, setNewListName] = useState('')
  const [newNoteKey, setNewNoteKey] = useState(0)

  useDailyListQuery(workspaceNumericId, today, queriesEnabled)
  const listsQuery = useTodoListsQuery(workspaceNumericId, today, queriesEnabled)
  const lists = listsQuery.data ?? []
  const todosQuery = useTodosQuery(workspaceNumericId, activeListId, queriesEnabled && Boolean(activeListId))
  const notesQuery = useNotesQuery(workspaceNumericId, activeListId, queriesEnabled && Boolean(activeListId))
  const items = todosQuery.data ?? []
  const notes = notesQuery.data ?? []

  useEffect(() => {
    if (!lists.length) return
    setActiveListId((current) => {
      if (current && lists.some((list) => list.id === current)) return current
      const daily = lists.find((list) => list.kind === 'daily' && list.list_date === today)
      return daily?.id ?? lists[0]?.id ?? null
    })
  }, [lists, today])

  async function refreshLists() {
    if (!workspaceNumericId) return
    await invalidateCheckLists(queryClient, workspaceNumericId)
  }

  function closeDialog() {
    setDialogOpen(false)
  }

  async function handleCreateItem(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspaceNumericId || !activeListId || !itemTitle.trim()) return
    await createTodo(token, workspaceNumericId, { list_id: activeListId, title: itemTitle.trim() })
    setItemTitle('')
    await refreshLists()
    closeDialog()
  }

  async function handleCreateList(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspaceNumericId || !newListName.trim()) return
    const list = await createTodoList(token, workspaceNumericId, {
      name: newListName.trim(),
      kind: 'general',
    })
    setNewListName('')
    setActiveListId(list.id)
    await refreshLists()
    closeDialog()
  }

  const activeList = lists.find((list) => list.id === activeListId)

  if (!token || !workspaceId || !workspaceNumericId) {
    return null
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        icon={CheckSquare}
        title="Check lists & notes"
        subtitle={`Active list: ${activeList?.name ?? 'None selected'}`}
        className="shrink-0"
      >
        {canManagePlanning ? (
        <PageHeaderIconButton icon={Plus} label="Add item" onClick={() => setDialogOpen(true)} />
        ) : null}
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto space-y-6 p-4">
        <div className="grid gap-6 xl:grid-cols-[280px_1fr_1fr]">
          <Card>
            <CardHeader><CardTitle>Lists</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {lists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setActiveListId(list.id)}
                  className={cn(
                    'flex w-full rounded-lg border px-3 py-2 text-left text-sm transition',
                    activeListId === list.id ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                  )}
                >
                  <div>
                    <p className="font-medium">{list.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {list.kind === 'daily' && list.list_date ? list.list_date : list.kind}
                    </p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Check list</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items in this list.</p>
              ) : (
                items.map((item) => (
                  <InlineCheckListItem
                    key={item.id}
                    token={token}
                    workspaceId={workspaceNumericId}
                    item={item}
                    onChange={() => void refreshLists()}
                  />
                ))
              )}
              {canManagePlanning ? (
              <form
                className="flex gap-2 pt-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!activeListId || !itemTitle.trim()) return
                  void (async () => {
                    await createTodo(token, workspaceNumericId, {
                      list_id: activeListId,
                      title: itemTitle.trim(),
                    })
                    setItemTitle('')
                    await refreshLists()
                  })()
                }}
              >
                <Input
                  value={itemTitle}
                  onChange={(event) => setItemTitle(event.target.value)}
                  placeholder="Add a check list item"
                />
                <Button type="submit" disabled={!activeListId || !itemTitle.trim()}>Add</Button>
              </form>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!activeListId ? (
                <p className="text-sm text-muted-foreground">Select a list to view notes.</p>
              ) : notes.length === 0 ? (
                <InlineNoteEditor
                  key={`new-note-${newNoteKey}`}
                  token={token}
                  workspaceId={workspaceNumericId}
                  listId={activeListId}
                  onSaved={() => {
                    void refreshLists()
                    setNewNoteKey((key) => key + 1)
                  }}
                />
              ) : (
                notes.map((note) => (
                  <InlineNoteEditor
                    key={note.id}
                    token={token}
                    workspaceId={workspaceNumericId}
                    listId={activeListId}
                    note={note}
                    onSaved={() => void refreshLists()}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <OperationDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Add to check lists">
        <OpsTabs
          tabs={[
            { id: 'item', label: 'Item' },
            { id: 'list', label: 'List' },
          ]}
          activeTab={activeTab}
          onChange={(tabId) => setActiveTab(tabId as CheckListTab)}
        />

        {activeTab === 'item' ? (
          <form className="space-y-4" onSubmit={(event) => void handleCreateItem(event)}>
            <p className="text-sm text-muted-foreground">
              Target list: {activeList?.name ?? 'Select a list'}
            </p>
            <FormField label="Item title" value={itemTitle} onChange={setItemTitle} id="checklist-item-title" />
            <Button type="submit" className="w-full" disabled={!activeListId}>Add item</Button>
          </form>
        ) : null}

        {activeTab === 'list' ? (
          <form className="space-y-4" onSubmit={(event) => void handleCreateList(event)}>
            <FormField label="List name" value={newListName} onChange={setNewListName} id="list-name" />
            <Button type="submit" className="w-full">Create list</Button>
          </form>
        ) : null}
      </OperationDialog>
    </div>
  )
}
