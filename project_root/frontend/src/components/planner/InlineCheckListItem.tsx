import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteTodo, updateTodo } from '@/lib/api'
import type { Todo } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'

type InlineCheckListItemProps = {
  token: string
  workspaceId: number
  item: Todo
  occurrence?: string
  onChange: () => void
  compact?: boolean
}

export function InlineCheckListItem({
  token,
  workspaceId,
  item,
  occurrence,
  onChange,
  compact = false,
}: InlineCheckListItemProps) {
  const { canManagePlanning } = useWorkspacePermissions()
  const [title, setTitle] = useState(item.title)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setTitle(item.title)
  }, [item.title])

  async function handleToggleCompleted() {
    await updateTodo(token, workspaceId, item.id, {
      completed: !item.completed,
      occurrence,
    })
    onChange()
  }

  async function handleSaveTitle() {
    const trimmed = title.trim()
    setEditing(false)
    if (!trimmed || trimmed === item.title) {
      setTitle(item.title)
      return
    }
    await updateTodo(token, workspaceId, item.id, { title: trimmed })
    onChange()
  }

  async function handleDelete() {
    await deleteTodo(token, workspaceId, item.id)
    onChange()
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm',
        compact ? 'py-0.5' : 'rounded-lg border p-2.5',
      )}
    >
      <input
        type="checkbox"
        checked={item.completed}
        disabled={!canManagePlanning}
        onChange={() => void handleToggleCompleted()}
        aria-label={`Mark ${item.title} complete`}
      />
      {editing ? (
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => void handleSaveTitle()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void handleSaveTitle()
            }
            if (event.key === 'Escape') {
              setTitle(item.title)
              setEditing(false)
            }
          }}
          className={cn('flex-1', compact ? 'h-7' : 'h-8')}
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => canManagePlanning && setEditing(true)}
          disabled={!canManagePlanning}
          className={cn(
            'min-w-0 flex-1 truncate text-left',
            item.completed && 'text-muted-foreground line-through',
            !canManagePlanning && 'cursor-default',
          )}
        >
          {item.title}
        </button>
      )}
      {canManagePlanning ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          'shrink-0 p-0 text-muted-foreground hover:text-foreground',
          compact ? 'h-7 w-7' : 'h-8 w-8',
        )}
        aria-label={`Delete ${item.title}`}
        onClick={() => void handleDelete()}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      ) : null}
    </div>
  )
}
