import { type FormEvent, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import { defaultRecurrenceConfig, RecurrencePicker } from '@/components/forms/RecurrencePicker'
import { WorkspaceField } from '@/components/workspace/WorkspaceField'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createEvent } from '@/lib/api'
import { buildRecurrenceRule } from '@/lib/recurrence'
import { useCreateWorkspaceSelection } from '@/lib/useCreateWorkspaceSelection'

type AddEventFormProps = {
  token: string
  workspaceId: number
  defaultDate?: string
  onCreated?: () => void
}

export function AddEventForm({ token, workspaceId: defaultWorkspaceId, defaultDate, onCreated }: AddEventFormProps) {
  const { creatableWorkspaces, selectedWorkspaceId, setSelectedWorkspaceId } = useCreateWorkspaceSelection(
    defaultWorkspaceId,
    'planning',
  )
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [recurrence, setRecurrence] = useState(defaultRecurrenceConfig)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return

    await createEvent(token, selectedWorkspaceId, {
      title: title.trim(),
      description,
      start_at: `${date}T09:00:00Z`,
      end_at: `${date}T10:00:00Z`,
      all_day: true,
      color: '#2563eb',
      recurrence: buildRecurrenceRule(recurrence, date),
    })

    setTitle('')
    setDescription('')
    setRecurrence(defaultRecurrenceConfig)
    onCreated?.()
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <WorkspaceField
        workspaces={creatableWorkspaces}
        value={selectedWorkspaceId}
        onChange={setSelectedWorkspaceId}
      />
      <FormField label="Title" value={title} onChange={setTitle} id="planner-event-title" />
      <FormField label="Date" type="date" value={date} onChange={setDate} id="planner-event-date" />
      <RecurrencePicker value={recurrence} anchorDate={date} onChange={setRecurrence} />
      <div className="space-y-2">
        <Label htmlFor="planner-event-description">Description (optional)</Label>
        <Textarea
          id="planner-event-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <Button type="submit" className="w-full">Create event</Button>
    </form>
  )
}
