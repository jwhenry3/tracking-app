import { type FormEvent, useState } from 'react'

import { OperationDialog } from '@/components/layout/OperationDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CreateWorkspaceResult } from '@/lib/types'
import { useAuthStore } from '@/stores/authStore'

type AddWorkspaceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: (result: CreateWorkspaceResult) => void
}

export function AddWorkspaceDialog({ open, onOpenChange, onComplete }: AddWorkspaceDialogProps) {
  const createWorkspace = useAuthStore((s) => s.createWorkspace)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setLoading(true)
    setFeedback(null)
    try {
      const result = await createWorkspace(trimmed, message.trim() || undefined)
      if (result.status === 'created') {
        setFeedback(`Created ${result.workspace.name}.`)
      } else if (result.status === 'already_member') {
        setFeedback(`You are already a member of ${result.workspace.name}.`)
      } else {
        setFeedback(`Access request sent to members of ${result.workspace.name}.`)
      }
      onComplete?.(result)
      if (result.status !== 'access_requested') {
        setName('')
        setMessage('')
        onOpenChange(false)
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not add workspace')
    } finally {
      setLoading(false)
    }
  }

  return (
    <OperationDialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        if (!nextOpen) {
          setFeedback(null)
          setName('')
          setMessage('')
        }
      }}
      title="Add workspace"
      description="Create a new workspace or request access if one with this name already exists."
    >
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="space-y-2">
          <Label htmlFor="workspace-name">Workspace name</Label>
          <Input
            id="workspace-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Smith Family"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workspace-message">Message for members (optional)</Label>
          <Textarea
            id="workspace-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Hi, I'd like to join this workspace."
            rows={3}
          />
        </div>
        {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Submitting…' : 'Continue'}
        </Button>
      </form>
    </OperationDialog>
  )
}
