import { type FormEvent, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import { defaultRecurrenceConfig, RecurrencePicker } from '@/components/forms/RecurrencePicker'
import { Button } from '@/components/ui/button'
import { createBill } from '@/lib/api'
import { buildRecurrenceRule } from '@/lib/recurrence'

type AddBillFormProps = {
  token: string
  workspaceId: number
  defaultDate?: string
  onCreated?: () => void
}

export function AddBillForm({ token, workspaceId, defaultDate, onCreated }: AddBillFormProps) {
  const today = defaultDate ?? new Date().toISOString().slice(0, 10)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState('utilities')
  const [recurrence, setRecurrence] = useState(defaultRecurrenceConfig)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return

    await createBill(token, workspaceId, {
      title: title.trim(),
      amount: Number(amount),
      date,
      category,
      recurrence: buildRecurrenceRule(recurrence, date),
    })

    setTitle('')
    setAmount('')
    setDate(today)
    setRecurrence(defaultRecurrenceConfig)
    onCreated?.()
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
      <FormField label="Title" value={title} onChange={setTitle} id="manage-bill-title" />
      <FormField label="Amount" type="number" value={amount} onChange={setAmount} id="manage-bill-amount" />
      <FormField label="Due date" type="date" value={date} onChange={setDate} id="manage-bill-date" />
      <FormField label="Category" value={category} onChange={setCategory} id="manage-bill-category" />
      <RecurrencePicker value={recurrence} anchorDate={date} onChange={setRecurrence} />
      <Button type="submit" className="w-full">
        Create bill
      </Button>
    </form>
  )
}
