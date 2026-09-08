import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { updateWorkspaceSettings } from '@/lib/api'
import type { Workspace, WorkspaceFocusArea } from '@/lib/types'
import { WORKSPACE_FOCUS_OPTIONS } from '@/lib/workspaceFocus'
import { useAuthStore } from '@/stores/authStore'

type WorkspaceSettingsProps = {
  workspace: Workspace
}

export function WorkspaceSettings({ workspace }: WorkspaceSettingsProps) {
  const token = useAuthStore((s) => s.token)
  const updateWorkspace = useAuthStore((s) => s.updateWorkspace)
  const [focusAreas, setFocusAreas] = useState<WorkspaceFocusArea[]>(workspace.focus_areas ?? [])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setFocusAreas(workspace.focus_areas ?? [])
  }, [workspace.id, workspace.focus_areas])

  function toggleFocusArea(area: WorkspaceFocusArea) {
    setFocusAreas((current) =>
      current.includes(area) ? current.filter((value) => value !== area) : [...current, area],
    )
  }

  async function handleSave() {
    if (!token) return

    setLoading(true)
    setFeedback(null)
    try {
      const updated = await updateWorkspaceSettings(token, workspace.id, focusAreas)
      updateWorkspace(updated)
      setFeedback('Workspace settings saved.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not save settings')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Areas of focus</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what this workspace is set up for. General tools like calendar and chat stay available.
        </p>
      </div>

      <div className="space-y-3">
        {WORKSPACE_FOCUS_OPTIONS.map((option) => {
          const checked = focusAreas.includes(option.id)

          return (
            <label
              key={option.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition hover:bg-muted/40"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={() => toggleFocusArea(option.id)}
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
              </span>
            </label>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void handleSave()} disabled={loading}>
          {loading ? 'Saving…' : 'Save settings'}
        </Button>
        {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Only workspace owners can change these settings.
      </p>
    </div>
  )
}
