import { useEffect, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import {
  ManageTable,
  ManageTableBody,
  ManageTableHead,
  ManageTableRow,
  ManageTableTd,
  ManageTableTh,
} from '@/components/manage/ManageTable'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { archiveWorkspace, updateWorkspaceSettings } from '@/lib/api'
import type { Workspace, WorkspaceFocusArea } from '@/lib/types'
import { generatedWorkspaceColor, resolveWorkspaceColor } from '@/lib/workspaceColors'
import { WORKSPACE_FOCUS_OPTIONS } from '@/lib/workspaceFocus'
import { useAuthStore } from '@/stores/authStore'

type WorkspaceSettingsProps = {
  workspace: Workspace
  onWorkspaceRemoved: () => void
}

export function WorkspaceSettings({ workspace, onWorkspaceRemoved }: WorkspaceSettingsProps) {
  const token = useAuthStore((s) => s.token)
  const loadWorkspaces = useAuthStore((s) => s.loadWorkspaces)
  const updateWorkspace = useAuthStore((s) => s.updateWorkspace)
  const [name, setName] = useState(workspace.name)
  const [focusAreas, setFocusAreas] = useState<WorkspaceFocusArea[]>(workspace.focus_areas ?? [])
  const [color, setColor] = useState(workspace.color ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveStep, setArchiveStep] = useState<1 | 2>(1)
  const [archiveConfirmName, setArchiveConfirmName] = useState('')
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    setName(workspace.name)
    setFocusAreas(workspace.focus_areas ?? [])
    setColor(workspace.color ?? '')
  }, [workspace.id, workspace.name, workspace.focus_areas, workspace.color])

  function resetArchiveDialog() {
    setArchiveStep(1)
    setArchiveConfirmName('')
    setArchiveError(null)
  }

  function toggleFocusArea(area: WorkspaceFocusArea) {
    setFocusAreas((current) =>
      current.includes(area) ? current.filter((value) => value !== area) : [...current, area],
    )
  }

  async function handleSave() {
    if (!token) return

    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      setFeedback('Workspace name must be at least 2 characters.')
      return
    }

    setLoading(true)
    setFeedback(null)
    try {
      const updated = await updateWorkspaceSettings(token, workspace.id, trimmedName, focusAreas, color || null)
      updateWorkspace(updated)
      setName(updated.name)
      setColor(updated.color ?? '')
      setFeedback('Workspace settings saved.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not save settings')
    } finally {
      setLoading(false)
    }
  }

  async function handleArchive() {
    if (!token) return
    if (archiveConfirmName.trim() !== workspace.name) {
      setArchiveError('Type the workspace name exactly to confirm.')
      return
    }

    setArchiving(true)
    setArchiveError(null)
    try {
      await archiveWorkspace(token, workspace.id)
      await loadWorkspaces()
      setArchiveOpen(false)
      resetArchiveDialog()
      onWorkspaceRemoved()
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Could not archive workspace')
    } finally {
      setArchiving(false)
    }
  }

  const previewWorkspace = { id: workspace.id, color: color || null }
  const previewColor = resolveWorkspaceColor(previewWorkspace)
  const defaultColor = generatedWorkspaceColor(workspace.id)
  const usesDefaultColor = !color

  return (
    <>
      <div className="space-y-6">
        <FormField
          id="workspace-settings-name"
          label="Workspace name"
          value={name}
          onChange={setName}
          placeholder="Demo Family"
        />

        <div>
          <h3 className="text-sm font-semibold">Workspace color</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Used for avatars, calendar filters, and grouped day chips across all calendars.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="color"
                value={previewColor}
                onChange={(event) => setColor(event.target.value)}
                className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
                aria-label="Workspace color"
              />
              <span className="font-mono text-xs text-muted-foreground">{previewColor}</span>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={usesDefaultColor}
              onClick={() => setColor('')}
            >
              Use default
            </Button>
            {usesDefaultColor ? (
              <span className="text-xs text-muted-foreground">Default: {defaultColor}</span>
            ) : null}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Areas of focus</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose what this workspace is set up for. General tools like calendar and chat stay available.
          </p>
        </div>

        <ManageTable tableClassName="min-w-[480px]">
          <ManageTableHead>
            <ManageTableTh>Area</ManageTableTh>
            <ManageTableTh>Description</ManageTableTh>
            <ManageTableTh className="w-24 text-center">Enabled</ManageTableTh>
          </ManageTableHead>
          <ManageTableBody>
            {WORKSPACE_FOCUS_OPTIONS.map((option) => {
              const checked = focusAreas.includes(option.id)

              return (
                <ManageTableRow key={option.id}>
                  <ManageTableTd className="font-medium">{option.label}</ManageTableTd>
                  <ManageTableTd className="text-muted-foreground">{option.description}</ManageTableTd>
                  <ManageTableTd className="text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      aria-label={`Enable ${option.label}`}
                      onChange={() => toggleFocusArea(option.id)}
                    />
                  </ManageTableTd>
                </ManageTableRow>
              )
            })}
          </ManageTableBody>
        </ManageTable>

        <div className="flex items-center gap-3">
          <Button type="button" onClick={() => void handleSave()} disabled={loading}>
            {loading ? 'Saving…' : 'Save settings'}
          </Button>
          {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
        </div>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <h3 className="text-sm font-semibold text-destructive">Archive workspace</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Archiving removes this workspace from everyone&apos;s list. Calendar events, bills, chat history,
            and other data stay stored but become inaccessible until restored by an admin.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="mt-4"
            onClick={() => {
              resetArchiveDialog()
              setArchiveOpen(true)
            }}
          >
            Archive workspace
          </Button>
        </div>
      </div>

      <Dialog
        open={archiveOpen}
        onOpenChange={(open) => {
          setArchiveOpen(open)
          if (!open) resetArchiveDialog()
        }}
      >
        <DialogContent className="max-w-md">
          <DialogBody className="p-6">
          {archiveStep === 1 ? (
            <div>
              <h2 className="text-lg font-semibold">Archive {workspace.name}?</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Every member will lose access immediately.</li>
                <li>The workspace disappears from all workspace lists.</li>
                <li>Data is preserved but not visible in the app.</li>
                <li>This cannot be undone from the app.</li>
              </ul>
              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setArchiveOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" onClick={() => setArchiveStep(2)}>
                  I understand, continue
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold">Confirm archive</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Type <span className="font-medium text-foreground">{workspace.name}</span> to confirm you
                want to archive this workspace.
              </p>
              <Input
                className="mt-4"
                value={archiveConfirmName}
                onChange={(event) => setArchiveConfirmName(event.target.value)}
                placeholder={workspace.name}
                autoComplete="off"
              />
              {archiveError ? <p className="mt-2 text-sm text-destructive">{archiveError}</p> : null}
              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setArchiveStep(1)}>
                  Back
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={archiving || archiveConfirmName.trim() !== workspace.name}
                  onClick={() => void handleArchive()}
                >
                  {archiving ? 'Archiving…' : 'Archive workspace'}
                </Button>
              </div>
            </div>
          )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
