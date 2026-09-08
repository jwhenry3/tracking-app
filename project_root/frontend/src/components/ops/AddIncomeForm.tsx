import { type FormEvent, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import { defaultRecurrenceConfig, RecurrencePicker } from '@/components/forms/RecurrencePicker'
import { WorkspaceField } from '@/components/workspace/WorkspaceField'
import { Button } from '@/components/ui/button'
import { createIncome } from '@/lib/api'
import { buildRecurrenceRule } from '@/lib/recurrence'
import { useCreateWorkspaceSelection } from '@/lib/useCreateWorkspaceSelection'

type AddIncomeFormProps = {
  token: string
  workspaceId: number
  defaultDate?: string
  onCreated?: () => void
}

export function AddIncomeForm({ token, workspaceId: defaultWorkspaceId, defaultDate, onCreated }: AddIncomeFormProps) {
  const { creatableWorkspaces, selectedWorkspaceId, setSelectedWorkspaceId } = useCreateWorkspaceSelection(
    defaultWorkspaceId,
    'finances',
  )
  const today = defaultDate ?? new Date().toISOString().slice(0, 10)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [recurrence, setRecurrence] = useState(defaultRecurrenceConfig)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return

    await createIncome(token, selectedWorkspaceId, {
      title: title.trim(),
      amount: Number(amount),
      date,
      notes: notes.trim() || undefined,
      recurrence: buildRecurrenceRule(recurrence, date),
    })

    setTitle('')
    setAmount('')
    setDate(today)
    setNotes('')
    setRecurrence(defaultRecurrenceConfig)
    onCreated?.()
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
      <WorkspaceField
        workspaces={creatableWorkspaces}
        value={selectedWorkspaceId}
        onChange={setSelectedWorkspaceId}
      />
      <FormField label="Title" value={title} onChange={setTitle} id="manage-income-title" />
      <FormField label="Amount" type="number" value={amount} onChange={setAmount} id="manage-income-amount" />
      <FormField label="Date" type="date" value={date} onChange={setDate} id="manage-income-date" />
      <FormField label="Notes (optional)" value={notes} onChange={setNotes} id="manage-income-notes" required={false} />
      <RecurrencePicker value={recurrence} anchorDate={date} onChange={setRecurrence} />
      <Button type="submit" className="w-full">
        Create income
      </Button>
    </form>
  )
}
