import { type FormEvent, useEffect, useState } from 'react'
import { MessageSquare, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { OperationDialog, OpsTabs } from '@/components/layout/OperationDialog'
import { WorkspaceSettings } from '@/components/workspace/WorkspaceSettings'
import {
  ManageTable,
  ManageTableBody,
  ManageTableHead,
  ManageTableRow,
  ManageTableTd,
  ManageTableTh,
} from '@/components/manage/ManageTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  acceptInvite,
  declineInvite,
  fetchMyInvites,
  fetchWorkspaceAccessRequests,
  fetchWorkspaceMembers,
  inviteWorkspaceMember,
  leaveWorkspace,
  reviewWorkspaceAccessRequest,
  updateWorkspaceMember,
} from '@/lib/api'
import type { Workspace, WorkspaceAccessRequest, WorkspaceFocusArea, WorkspaceInvite, WorkspaceMember } from '@/lib/types'
import { WORKSPACE_FOCUS_OPTIONS, workspaceHasFocus } from '@/lib/workspaceFocus'
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
  const [activeTab, setActiveTab] = useState<'members' | 'settings'>('members')
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const canManageSettings = workspace?.role === 'owner'
  const canLeave = workspace?.role !== 'owner'

  async function loadPanelData() {
    if (!token || !workspace) return
    const [memberData, requestData, inviteData] = await Promise.all([
      fetchWorkspaceMembers(token, workspace.id),
      workspace.role === 'owner'
        ? fetchWorkspaceAccessRequests(token, workspace.id)
        : Promise.resolve({ requests: [] as WorkspaceAccessRequest[] }),
      fetchMyInvites(token),
    ])
    setMembers(memberData.members)
    setRequests(requestData.requests)
    setInvites(inviteData.invites)
  }

  useEffect(() => {
    if (!open) {
      setActiveTab('members')
    }
  }, [open])

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

  async function handleToggleManage(member: WorkspaceMember, area: WorkspaceFocusArea) {
    if (!token || !workspace) return
    const current = member.manage_areas ?? []
    const next = current.includes(area)
      ? current.filter((value) => value !== area)
      : [...current, area]
    setLoading(true)
    setFeedback(null)
    try {
      await updateWorkspaceMember(token, workspace.id, member.user_id, next)
      await loadPanelData()
      await loadWorkspaces()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not update member permissions')
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

  async function handleLeave() {
    if (!token || !workspace) return
    setLeaving(true)
    setFeedback(null)
    try {
      await leaveWorkspace(token, workspace.id)
      await loadWorkspaces()
      setLeaveOpen(false)
      onOpenChange(false)
      const remaining = useAuthStore.getState().workspaces
      const next = remaining[0]
      navigate(next ? `/w/${next.id}/calendar` : '/')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not leave workspace')
    } finally {
      setLeaving(false)
    }
  }

  function handleWorkspaceRemoved() {
    onOpenChange(false)
    const remaining = useAuthStore.getState().workspaces
    const next = remaining[0]
    navigate(next ? `/w/${next.id}/calendar` : '/')
  }

  if (!workspace) {
    return null
  }

  const grantableAreas = WORKSPACE_FOCUS_OPTIONS.filter((option) =>
    workspaceHasFocus(workspace, option.id),
  )

  return (
    <OperationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={workspace.name}
      description="Members, invites, and workspace settings."
    >
      <OpsTabs
        tabs={[
          { id: 'members', label: 'Members' },
          ...(canManageSettings ? [{ id: 'settings', label: 'Settings' }] : []),
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as 'members' | 'settings')}
      />

      {activeTab === 'settings' && canManageSettings ? (
        <WorkspaceSettings workspace={workspace} onWorkspaceRemoved={handleWorkspaceRemoved} />
      ) : null}

      {activeTab === 'members' ? (
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
          <ManageTable tableClassName="min-w-[480px]">
            <ManageTableHead>
              <ManageTableTh>Member</ManageTableTh>
              <ManageTableTh>Role</ManageTableTh>
              {grantableAreas.map((area) => (
                <ManageTableTh key={area.id} className="text-center">
                  Manage {area.label.toLowerCase()}
                </ManageTableTh>
              ))}
            </ManageTableHead>
            <ManageTableBody>
              {members.map((member) => {
                const granted = member.manage_areas ?? []

                return (
                  <ManageTableRow key={member.user_id}>
                    <ManageTableTd className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        {member.username}
                        {member.username === username ? (
                          <Badge className="bg-secondary text-secondary-foreground">You</Badge>
                        ) : null}
                      </span>
                    </ManageTableTd>
                    <ManageTableTd className="capitalize text-muted-foreground">{member.role}</ManageTableTd>
                    {grantableAreas.map((area) => (
                      <ManageTableTd key={area.id} className="text-center">
                        {member.role === 'owner' ? (
                          <span className="text-xs text-muted-foreground">All</span>
                        ) : canManageSettings ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={granted.includes(area.id)}
                            disabled={loading}
                            aria-label={`Allow ${member.username} to manage ${area.label.toLowerCase()}`}
                            onChange={() => void handleToggleManage(member, area.id)}
                          />
                        ) : granted.includes(area.id) ? (
                          <span className="text-xs text-muted-foreground">Yes</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </ManageTableTd>
                    ))}
                  </ManageTableRow>
                )
              })}
            </ManageTableBody>
          </ManageTable>
        </section>

        {canManageSettings ? (
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
        ) : null}

        {canManageSettings && requests.length > 0 ? (
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

        {canLeave ? (
          <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <h3 className="text-sm font-semibold text-destructive">Leave workspace</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Remove {workspace.name} from your workspace list. You can request access again later if needed.
            </p>
            <Button
              type="button"
              variant="destructive"
              className="mt-4"
              onClick={() => setLeaveOpen(true)}
            >
              Leave workspace
            </Button>
          </section>
        ) : null}
      </div>
      ) : null}

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="max-w-md">
          <div className="p-6">
            <h2 className="text-lg font-semibold">Leave {workspace.name}?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You will lose access to this workspace&apos;s calendar, finances, chat, and other data.
              Other members will not be affected.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLeaveOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={leaving} onClick={() => void handleLeave()}>
                {leaving ? 'Leaving…' : 'Leave workspace'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </OperationDialog>
  )
}
