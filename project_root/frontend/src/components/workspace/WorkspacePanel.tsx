import { type FormEvent, useEffect, useState } from 'react'
import { MessageSquare, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { OperationDialog } from '@/components/layout/OperationDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  acceptInvite,
  declineInvite,
  fetchMyInvites,
  fetchWorkspaceAccessRequests,
  fetchWorkspaceMembers,
  inviteWorkspaceMember,
  reviewWorkspaceAccessRequest,
} from '@/lib/api'
import type { Workspace, WorkspaceAccessRequest, WorkspaceInvite, WorkspaceMember } from '@/lib/types'
import { useAuthStore } from '@/stores/authStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

type WorkspacePanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspace: Workspace | undefined
}

export function WorkspacePanel({ open, onOpenChange, workspace }: WorkspacePanelProps) {
  const token = useAuthStore((s) => s.token)
  const username = useAuthStore((s) => s.username)
  const loadWorkspaces = useAuthStore((s) => s.loadWorkspaces)
  const setOnUpdate = useRealtimeStore((s) => s.setOnUpdate)
  const navigate = useNavigate()

  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [requests, setRequests] = useState<WorkspaceAccessRequest[]>([])
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [inviteUsername, setInviteUsername] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function loadPanelData() {
    if (!token || !workspace) return
    const [memberData, requestData, inviteData] = await Promise.all([
      fetchWorkspaceMembers(token, workspace.id),
      fetchWorkspaceAccessRequests(token, workspace.id),
      fetchMyInvites(token),
    ])
    setMembers(memberData.members)
    setRequests(requestData.requests)
    setInvites(inviteData.invites)
  }

  useEffect(() => {
    if (!open || !workspace) return
    void loadPanelData()
  }, [open, workspace?.id, token])

  useEffect(() => {
    if (!open || !workspace) return
    setOnUpdate(() => {
      void loadPanelData()
    })
    return () => setOnUpdate(null)
  }, [open, workspace?.id, token])

  async function handleInvite(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspace || !inviteUsername.trim()) return
    setLoading(true)
    setFeedback(null)
    try {
      const target = inviteUsername.trim()
      await inviteWorkspaceMember(token, workspace.id, target)
      setInviteUsername('')
      setFeedback(`Invite sent to ${target}.`)
      await loadPanelData()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not send invite')
    } finally {
      setLoading(false)
    }
  }

  async function handleReview(requestId: number, action: 'approve' | 'deny') {
    if (!token || !workspace) return
    await reviewWorkspaceAccessRequest(token, workspace.id, requestId, action)
    await loadPanelData()
    if (action === 'approve') {
      await loadWorkspaces()
    }
  }

  async function handleAcceptInvite(inviteId: number) {
    if (!token) return
    const result = await acceptInvite(token, inviteId)
    await loadWorkspaces()
    onOpenChange(false)
    navigate(`/w/${result.workspace.id}/calendar`)
  }

  async function handleDeclineInvite(inviteId: number) {
    if (!token) return
    await declineInvite(token, inviteId)
    await loadPanelData()
  }

  if (!workspace) {
    return null
  }

  return (
    <OperationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={workspace.name}
      description="Members, invites, and access requests for this workspace."
    >
      <div className="space-y-6">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Members</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onOpenChange(false)
                navigate(`/w/${workspace.id}/chat`)
              }}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Open chat
            </Button>
          </div>
          <div className="space-y-2">
            {members.map((member) => (
              <div key={member.user_id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{member.username}</p>
                  <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                </div>
                {member.username === username ? <Badge className="bg-secondary text-secondary-foreground">You</Badge> : null}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Invite member</h3>
          <form className="flex gap-2" onSubmit={(event) => void handleInvite(event)}>
            <Input
              value={inviteUsername}
              onChange={(event) => setInviteUsername(event.target.value)}
              placeholder="Username"
              aria-label="Invite username"
            />
            <Button type="submit" disabled={loading || !inviteUsername.trim()}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite
            </Button>
          </form>
        </section>

        {requests.length > 0 ? (
          <section>
            <h3 className="mb-3 text-sm font-semibold">Access requests</h3>
            <div className="space-y-2">
              {requests.map((request) => (
                <div key={request.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{request.username}</p>
                  {request.message ? (
                    <p className="mt-1 text-sm text-muted-foreground">{request.message}</p>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <Button type="button" size="sm" onClick={() => void handleReview(request.id, 'approve')}>
                      Approve
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void handleReview(request.id, 'deny')}>
                      Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {invites.length > 0 ? (
          <section>
            <h3 className="mb-3 text-sm font-semibold">Your invites</h3>
            <div className="space-y-2">
              {invites.map((invite) => (
                <div key={invite.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{invite.workspace_name}</p>
                  <p className="text-xs text-muted-foreground">Invited by {invite.invited_by}</p>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" size="sm" onClick={() => void handleAcceptInvite(invite.id)}>
                      Accept
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void handleDeclineInvite(invite.id)}>
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
      </div>
    </OperationDialog>
  )
}
