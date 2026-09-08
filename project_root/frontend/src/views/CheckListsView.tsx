import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { CheckSquare, Plus, Trash2 } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { FormField } from '@/components/forms/FormField'
import { OperationDialog, OpsTabs } from '@/components/layout/OperationDialog'
import { PageHeader, PageHeaderIconButton } from '@/components/layout/PageHeader'
import { InlineNoteEditor } from '@/components/notes/InlineNoteEditor'
import { InlineCheckListItem } from '@/components/planner/InlineCheckListItem'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createTodo, createTodoList, deleteTodoList } from '@/lib/api'
import { invalidateCheckLists } from '@/lib/queries/invalidate'
import {
  useNotesQuery,
  useTodoListsQuery,
  useTodosQuery,
} from '@/lib/queries/hooks'
import type { TodoList } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'
import { useAuthStore } from '@/stores/authStore'

type CheckListTab = 'item' | 'list'

function formatListDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function listSubtitle(list: TodoList) {
  if (list.kind === 'daily' && list.list_date) {
    return formatListDate(list.list_date)
  }
  return 'General list'
}

function deleteListDescription(list: TodoList) {
  if (list.kind === 'daily' && list.list_date) {
    return `Remove the daily plan for ${formatListDate(list.list_date)}? All check list items in this plan will be deleted. Notes linked to this plan will be kept but unassigned.`
  }
  return `Remove "${list.name}"? All check list items in this list will be deleted. Notes linked to this list will be kept but unassigned.`
}

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
  const [deleteTarget, setDeleteTarget] = useState<TodoList | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [itemTitle, setItemTitle] = useState('')
  const [newListName, setNewListName] = useState('')
  const [newNoteKey, setNewNoteKey] = useState(0)

  const listsQuery = useTodoListsQuery(workspaceNumericId, undefined, queriesEnabled)
  const lists = listsQuery.data ?? []
  const sortedLists = useMemo(() => {
    const daily = lists
      .filter((list) => list.kind === 'daily')
      .sort((a, b) => (b.list_date ?? '').localeCompare(a.list_date ?? ''))
    const general = lists
      .filter((list) => list.kind !== 'daily')
      .sort((a, b) => a.name.localeCompare(b.name))
    return [...daily, ...general]
  }, [lists])

  const todosQuery = useTodosQuery(workspaceNumericId, activeListId, queriesEnabled && Boolean(activeListId))
  const notesQuery = useNotesQuery(workspaceNumericId, activeListId, queriesEnabled && Boolean(activeListId))
  const items = todosQuery.data ?? []
  const notes = notesQuery.data ?? []

  useEffect(() => {
    if (!sortedLists.length) {
      setActiveListId(null)
      return
    }
    setActiveListId((current) => {
      if (current && sortedLists.some((list) => list.id === current)) return current
      const todayDaily = sortedLists.find((list) => list.kind === 'daily' && list.list_date === today)
      return todayDaily?.id ?? sortedLists[0]?.id ?? null
    })
  }, [sortedLists, today])

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

  async function handleDeleteList() {
    if (!token || !workspaceNumericId || !deleteTarget) return
    setDeleting(true)
    try {
      await deleteTodoList(token, workspaceNumericId, deleteTarget.id)
      if (activeListId === deleteTarget.id) {
        const remaining = sortedLists.filter((list) => list.id !== deleteTarget.id)
        setActiveListId(remaining[0]?.id ?? null)
      }
      setDeleteTarget(null)
      await refreshLists()
    } finally {
      setDeleting(false)
    }
  }

  const activeList = sortedLists.find((list) => list.id === activeListId)
  const dailyLists = sortedLists.filter((list) => list.kind === 'daily')
  const generalLists = sortedLists.filter((list) => list.kind !== 'daily')

  if (!token || !workspaceId || !workspaceNumericId) {
    return null
  }

  function renderListButton(list: TodoList, compact = false) {
    const selected = activeListId === list.id
    return (
      <div
        key={list.id}
        className={cn(
          'flex items-center gap-1',
          compact ? 'shrink-0' : 'w-full',
        )}
      >
        <button
          type="button"
          onClick={() => setActiveListId(list.id)}
          className={cn(
            'min-w-0 text-left transition',
            compact
              ? 'shrink-0 rounded-full border px-3 py-1.5 text-sm'
              : 'flex-1 rounded-lg border px-3 py-2 text-sm',
            selected
              ? compact
                ? 'border-primary bg-primary/10 font-medium'
                : 'border-primary bg-primary/5'
              : 'hover:bg-muted',
          )}
        >
          <p className={cn('truncate font-medium', compact && 'max-w-[10rem]')}>{list.name}</p>
          {!compact ? (
            <p className="text-xs text-muted-foreground">{listSubtitle(list)}</p>
          ) : null}
        </button>
        {canManagePlanning ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'shrink-0 p-0 text-muted-foreground hover:text-destructive',
              compact ? 'h-8 w-8' : 'h-8 w-8',
            )}
            aria-label={`Delete ${list.name}`}
            onClick={() => setDeleteTarget(list)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    )
  }

  function renderListSection(title: string, sectionLists: TodoList[]) {
    if (sectionLists.length === 0) return null
    return (
      <div className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {sectionLists.map((list) => renderListButton(list))}
      </div>
    )
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
          <>
            {activeList ? (
              <PageHeaderIconButton
                icon={Trash2}
                label={`Delete ${activeList.name}`}
                onClick={() => setDeleteTarget(activeList)}
              />
            ) : null}
            <PageHeaderIconButton icon={Plus} label="Add item" onClick={() => setDialogOpen(true)} />
          </>
        ) : null}
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto space-y-4 p-3 md:space-y-6 md:p-4">
        <div className="flex gap-2 overflow-x-auto pb-1 xl:hidden">
          {sortedLists.map((list) => renderListButton(list, true))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[280px_1fr_1fr]">
          <Card className="hidden xl:block">
            <CardHeader><CardTitle>Lists</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {sortedLists.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lists yet.</p>
              ) : (
                <>
                  {renderListSection('Daily plans', dailyLists)}
                  {renderListSection('General', generalLists)}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Check list</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!activeListId ? (
                <p className="text-sm text-muted-foreground">Select a list to view items.</p>
              ) : items.length === 0 ? (
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
              {canManagePlanning && activeListId ? (
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

      <OperationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={deleteTarget?.kind === 'daily' ? 'Remove daily plan' : 'Remove list'}
        description={deleteTarget ? deleteListDescription(deleteTarget) : undefined}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={() => void handleDeleteList()}
          >
            {deleting ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </OperationDialog>
    </div>
  )
}
