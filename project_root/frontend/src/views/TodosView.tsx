import { type FormEvent, useEffect, useState } from 'react'
import { CheckSquare, Plus } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { FormField } from '@/components/forms/FormField'
import { OperationDialog, OpsTabs } from '@/components/layout/OperationDialog'
import { PageHeader, PageHeaderIconButton } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createNote,
  createTodo,
  createTodoList,
  ensureDailyList,
  fetchNotes,
  fetchTodoLists,
  fetchTodos,
  updateTodo,
} from '@/lib/api'
import type { Note, Todo, TodoList } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

type TodoTab = 'todo' | 'note' | 'list'

export function TodosView() {
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
  const setOnUpdate = useRealtimeStore((s) => s.setOnUpdate)

  const today = new Date().toISOString().slice(0, 10)
  const [lists, setLists] = useState<TodoList[]>([])
  const [activeListId, setActiveListId] = useState<number | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [activeTab, setActiveTab] = useState<TodoTab>('todo')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [todoTitle, setTodoTitle] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [newListName, setNewListName] = useState('')

  async function loadAll() {
    if (!token || !workspaceId) return
    const id = Number(workspaceId)
    await ensureDailyList(token, id, today)
    const listData = await fetchTodoLists(token, id, today)
    setLists(listData.lists)

    const daily = listData.lists.find((list) => list.kind === 'daily' && list.list_date === today)
    const nextListId = activeListId ?? daily?.id ?? listData.lists[0]?.id ?? null
    setActiveListId(nextListId)

    if (nextListId) {
      const [todoData, noteData] = await Promise.all([
        fetchTodos(token, id, nextListId),
        fetchNotes(token, id, nextListId),
      ])
      setTodos(todoData.todos)
      setNotes(noteData.notes)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [token, workspaceId])

  useEffect(() => {
    setOnUpdate(() => {
      void loadAll()
    })
    return () => setOnUpdate(null)
  }, [token, workspaceId, activeListId])

  function closeDialog() {
    setDialogOpen(false)
  }

  async function handleCreateTodo(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspaceId || !activeListId || !todoTitle.trim()) return
    await createTodo(token, Number(workspaceId), { list_id: activeListId, title: todoTitle.trim() })
    setTodoTitle('')
    await loadAll()
    closeDialog()
  }

  async function handleToggleTodo(todo: Todo) {
    if (!token || !workspaceId) return
    await updateTodo(token, Number(workspaceId), todo.id, { completed: !todo.completed })
    await loadAll()
  }

  async function handleCreateNote(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspaceId || !noteTitle.trim()) return
    await createNote(token, Number(workspaceId), {
      title: noteTitle.trim(),
      content: noteContent,
      list_id: activeListId ?? undefined,
    })
    setNoteTitle('')
    setNoteContent('')
    await loadAll()
    closeDialog()
  }

  async function handleCreateList(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspaceId || !newListName.trim()) return
    const list = await createTodoList(token, Number(workspaceId), {
      name: newListName.trim(),
      kind: 'general',
    })
    setNewListName('')
    setActiveListId(list.id)
    await loadAll()
    closeDialog()
  }

  const activeList = lists.find((list) => list.id === activeListId)

  return (
    <>
      <PageHeader
        icon={CheckSquare}
        title="Todos & notes"
        subtitle={`Active list: ${activeList?.name ?? 'None selected'}`}
      >
        <PageHeaderIconButton icon={Plus} label="Add item" onClick={() => setDialogOpen(true)} />
      </PageHeader>

      <div className="space-y-6 p-4">
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
                    <p className="text-xs text-muted-foreground capitalize">{list.kind}{list.list_date ? ` · ${list.list_date}` : ''}</p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Todos</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {todos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No todos in this list.</p>
              ) : (
                todos.map((todo) => (
                  <label key={todo.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => void handleToggleTodo(todo)}
                    />
                    <span className={cn(todo.completed && 'text-muted-foreground line-through')}>{todo.title}</span>
                  </label>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes for this list.</p>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="rounded-lg border p-3">
                    <p className="font-medium">{note.title}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{note.content}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <OperationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Add item"
        description="Create a todo, note, or list."
      >
        <OpsTabs
          tabs={[
            { id: 'todo', label: 'Todo' },
            { id: 'note', label: 'Note' },
            { id: 'list', label: 'List' },
          ]}
          activeTab={activeTab}
          onChange={(tabId) => setActiveTab(tabId as TodoTab)}
        />

        {activeTab === 'todo' ? (
          <form className="space-y-4" onSubmit={(event) => void handleCreateTodo(event)}>
            <p className="text-sm text-muted-foreground">
              Target list: {activeList?.name ?? 'Select a list'}
            </p>
            <FormField label="Todo title" value={todoTitle} onChange={setTodoTitle} id="todo-title" />
            <Button type="submit" className="w-full" disabled={!activeListId}>Add todo</Button>
          </form>
        ) : null}

        {activeTab === 'note' ? (
          <form className="space-y-4" onSubmit={(event) => void handleCreateNote(event)}>
            <FormField label="Note title" value={noteTitle} onChange={setNoteTitle} id="note-title" />
            <div className="space-y-2">
              <Label htmlFor="note-content">Content</Label>
              <Textarea id="note-content" value={noteContent} onChange={(event) => setNoteContent(event.target.value)} />
            </div>
            <Button type="submit" className="w-full">Save note</Button>
          </form>
        ) : null}

        {activeTab === 'list' ? (
          <form className="space-y-4" onSubmit={(event) => void handleCreateList(event)}>
            <FormField label="List name" value={newListName} onChange={setNewListName} id="list-name" />
            <Button type="submit" className="w-full">Create list</Button>
          </form>
        ) : null}
      </OperationDialog>
    </>
  )
}
