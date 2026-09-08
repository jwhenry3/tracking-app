import { type FormEvent, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import { EventTimeRangeFields } from '@/components/forms/EventTimeRangeFields'
import { defaultRecurrenceConfig, RecurrencePicker } from '@/components/forms/RecurrencePicker'
import { WorkspaceField } from '@/components/workspace/WorkspaceField'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createEvent } from '@/lib/api'
import {
  buildEventSchedule,
  defaultEventTimeRangeState,
  type EventTimeRangeState,
} from '@/lib/eventTimeRange'
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
  const [timeRange, setTimeRange] = useState<EventTimeRangeState>(defaultEventTimeRangeState)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return

    const schedule = buildEventSchedule(date, timeRange)

    await createEvent(token, selectedWorkspaceId, {
      title: title.trim(),
      description,
      ...schedule,
      color: '#2563eb',
      recurrence: buildRecurrenceRule(recurrence, date),
    })

    setTitle('')
    setDescription('')
    setRecurrence(defaultRecurrenceConfig)
    setTimeRange(defaultEventTimeRangeState())
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
      <EventTimeRangeFields value={timeRange} onChange={setTimeRange} idPrefix="planner-event-time" />
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
