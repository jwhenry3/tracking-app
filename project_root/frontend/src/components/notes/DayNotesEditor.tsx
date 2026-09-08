import { useEffect, useRef, useState } from 'react'

import { MarkdownContent } from '@/components/notes/MarkdownContent'
import { MarkdownEditor } from '@/components/notes/MarkdownEditor'
import { createNote, updateNote } from '@/lib/api'
import type { Note } from '@/lib/types'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'

type DayNotesEditorProps = {
  token: string
  workspaceId: number
  listId: number
  note: Note | null
  onSaved: () => void
}

export function DayNotesEditor({ token, workspaceId, listId, note, onSaved }: DayNotesEditorProps) {
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
        title: 'Notes',
        content: next,
        list_id: listId,
      })
      setNoteId(created.id)
    } else {
      return
    }

    onSaved()
  }

  return canManagePlanning ? (
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
      placeholder="Write notes for this day…"
      rows={5}
    />
  ) : content.trim() ? (
    <MarkdownContent content={content} className="text-sm" />
  ) : (
    <p className="text-sm text-muted-foreground">No notes for this day.</p>
  )
}
