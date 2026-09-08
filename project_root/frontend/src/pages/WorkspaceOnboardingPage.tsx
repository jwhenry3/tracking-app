import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { acceptInvite, declineInvite } from '@/lib/api'
import { useMyInvitesQuery } from '@/lib/queries/hooks'
import { useAuthStore } from '@/stores/authStore'

export function WorkspaceOnboardingPage() {
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)
  const createWorkspace = useAuthStore((state) => state.createWorkspace)
  const loadWorkspaces = useAuthStore((state) => state.loadWorkspaces)
  const invitesQuery = useMyInvitesQuery()
  const invites = invitesQuery.data?.invites ?? []

  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [inviteBusyId, setInviteBusyId] = useState<number | null>(null)

  useEffect(() => {
    void loadWorkspaces()
  }, [loadWorkspaces])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    setFeedback(null)
    try {
      const result = await createWorkspace(trimmed, message.trim() || undefined)
      if (result.status === 'created' || result.status === 'already_member') {
        navigate(`/w/${result.workspace.id}/calendar`)
      } else {
        setFeedback(`Access request sent to members of ${result.workspace.name}.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join or create workspace')
    } finally {
      setLoading(false)
    }
  }

  async function handleAcceptInvite(inviteId: number) {
    if (!token) return
    setInviteBusyId(inviteId)
    setError(null)
    try {
      const result = await acceptInvite(token, inviteId)
      await loadWorkspaces()
      navigate(`/w/${result.workspace.id}/calendar`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept invite')
    } finally {
      setInviteBusyId(null)
    }
  }

  async function handleDeclineInvite(inviteId: number) {
    if (!token) return
    setInviteBusyId(inviteId)
    setError(null)
    try {
      await declineInvite(token, inviteId)
      await invitesQuery.refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline invite')
    } finally {
      setInviteBusyId(null)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join or create a workspace</CardTitle>
          <CardDescription>
            Enter a workspace name to create a new one, or request access if it already exists.
            You can also accept an invite below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {invites.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Pending invites</h2>
              {invites.map((invite) => (
                <div key={invite.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{invite.workspace_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Invited by {invite.invited_by}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={inviteBusyId === invite.id}
                      onClick={() => void handleAcceptInvite(invite.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={inviteBusyId === invite.id}
                      onClick={() => void handleDeclineInvite(invite.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Smith Family"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-message">Message for members (optional)</Label>
              <Textarea
                id="workspace-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Hi, I'd like to join this workspace."
                rows={3}
              />
            </div>
            {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? 'Submitting…' : 'Continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
