import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { MarkdownContent } from '@/components/notes/MarkdownContent'
import { MarkdownEditor } from '@/components/notes/MarkdownEditor'
import { Button } from '@/components/ui/button'
import { createNote, deleteNote, updateNote } from '@/lib/api'
import type { Note } from '@/lib/types'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'

type InlineNoteEditorProps = {
  token: string
  workspaceId: number
  listId: number
  note?: Note
  defaultTitle?: string
  onSaved: () => void
}

export function InlineNoteEditor({
  token,
  workspaceId,
  listId,
  note,
  defaultTitle = 'Notes',
  onSaved,
}: InlineNoteEditorProps) {
  const { canManagePlanning } = useWorkspacePermissions()
  const [content, setContent] = useState(note?.content ?? '')
  const [noteId, setNoteId] = useState<number | null>(note?.id ?? null)
  const saveTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    setContent(note?.content ?? '')
    setNoteId(note?.id ?? null)
  }, [note?.id, note?.content])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== undefined) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  function scheduleSave(next: string) {
    if (saveTimerRef.current !== undefined) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      void persist(next)
    }, 700)
  }

  async function persist(next: string) {
    if (noteId) {
      await updateNote(token, workspaceId, noteId, { content: next })
    } else if (next.trim()) {
      const created = await createNote(token, workspaceId, {
        title: defaultTitle,
        content: next,
        list_id: listId,
      })
      setNoteId(created.id)
    } else {
      return
    }

    onSaved()
  }

  async function handleDelete() {
    if (!noteId) return
    await deleteNote(token, workspaceId, noteId)
    setNoteId(null)
    setContent('')
    onSaved()
  }

  if (!canManagePlanning) {
    return content.trim() ? (
      <MarkdownContent content={content} className="text-sm" />
    ) : (
      <p className="text-sm text-muted-foreground">No notes in this list.</p>
    )
  }

  return (
    <div className="space-y-2">
      <MarkdownEditor
        value={content}
        onChange={(next) => {
          setContent(next)
          scheduleSave(next)
        }}
        onBlur={() => {
          if (saveTimerRef.current !== undefined) {
            window.clearTimeout(saveTimerRef.current)
          }
          void persist(content)
        }}
        placeholder="Write a note in markdown…"
        rows={5}
      />
      {noteId ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={() => void handleDelete()}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete note
          </Button>
        </div>
      ) : null}
    </div>
  )
}
