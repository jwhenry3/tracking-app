import { type FormEvent, useEffect, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createNote,
  createTodo,
  ensureDailyList,
  fetchNotes,
  fetchTodos,
} from '@/lib/api'
import type { Note, Todo } from '@/lib/types'
import { cn } from '@/lib/utils'

type PlannerDayItemsProps = {
  token: string
  workspaceId: number
  date: string
  reloadKey?: number
}

export function PlannerDayItems({ token, workspaceId, date, reloadKey = 0 }: PlannerDayItemsProps) {
  const [dailyListId, setDailyListId] = useState<number | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [todoTitle, setTodoTitle] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadDayItems() {
    setLoading(true)
    try {
      const daily = await ensureDailyList(token, workspaceId, date)
      setDailyListId(daily.list_id)

      const [todoData, noteData] = await Promise.all([
        fetchTodos(token, workspaceId, daily.list_id),
        fetchNotes(token, workspaceId, daily.list_id),
      ])
      setTodos(todoData.todos)
      setNotes(noteData.notes)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDayItems()
  }, [token, workspaceId, date, reloadKey])

  async function handleCreateTodo(event: FormEvent) {
    event.preventDefault()
    if (!dailyListId || !todoTitle.trim()) return
    await createTodo(token, workspaceId, { list_id: dailyListId, title: todoTitle.trim() })
    setTodoTitle('')
    await loadDayItems()
  }

  async function handleCreateNote(event: FormEvent) {
    event.preventDefault()
    if (!dailyListId || !noteTitle.trim()) return
    await createNote(token, workspaceId, {
      title: noteTitle.trim(),
      content: noteContent,
      list_id: dailyListId,
    })
    setNoteTitle('')
    setNoteContent('')
    await loadDayItems()
  }

  if (loading && dailyListId === null) {
    return <p className="text-sm text-muted-foreground">Loading lists…</p>
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Todos</p>
        <div className="space-y-2">
          {todos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No todos for this day.</p>
          ) : (
            todos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                <input type="checkbox" checked={todo.completed} disabled className="opacity-70" />
                <span className={cn(todo.completed && 'text-muted-foreground line-through')}>{todo.title}</span>
              </div>
            ))
          )}
          <form onSubmit={(event) => void handleCreateTodo(event)}>
            <div className="flex gap-2">
              <Input
                id={`todo-title-${date}`}
                value={todoTitle}
                onChange={(event) => setTodoTitle(event.target.value)}
                placeholder="Add a todo"
                className="flex-1"
              />
              <Button type="submit" size="sm" className="shrink-0" disabled={!dailyListId || !todoTitle.trim()}>
                Add todo
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
        <div className="space-y-2">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes for this day.</p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="rounded-lg border p-2.5">
                <p className="text-sm font-medium">{note.title}</p>
                {note.content ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{note.content}</p>
                ) : null}
              </div>
            ))
          )}
          <form className="space-y-3 rounded-lg border bg-muted/30 p-3" onSubmit={(event) => void handleCreateNote(event)}>
            <FormField label="Note title" value={noteTitle} onChange={setNoteTitle} id={`note-title-${date}`} />
            <div className="space-y-2">
              <Label htmlFor={`note-content-${date}`}>Content</Label>
              <Textarea
                id={`note-content-${date}`}
                value={noteContent}
                onChange={(event) => setNoteContent(event.target.value)}
                placeholder="Add a note"
                rows={3}
              />
            </div>
            <Button type="submit" size="sm" disabled={!dailyListId || !noteTitle.trim()}>
              Save note
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
