import { type FormEvent, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import { Button } from '@/components/ui/button'
import { createExpense } from '@/lib/api'

type AddExpenseFormProps = {
  token: string
  workspaceId: number
  defaultDate?: string
  onCreated?: () => void
}

export function AddExpenseForm({ token, workspaceId, defaultDate, onCreated }: AddExpenseFormProps) {
  const today = defaultDate ?? new Date().toISOString().slice(0, 10)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState('general')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return

    await createExpense(token, workspaceId, {
      title: title.trim(),
      amount: Number(amount),
      date,
      category,
    })

    setTitle('')
    setAmount('')
    setDate(today)
    onCreated?.()
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
      <FormField label="Title" value={title} onChange={setTitle} id="manage-expense-title" />
      <FormField label="Amount" type="number" value={amount} onChange={setAmount} id="manage-expense-amount" />
      <FormField label="Date" type="date" value={date} onChange={setDate} id="manage-expense-date" />
      <FormField label="Category" value={category} onChange={setCategory} id="manage-expense-category" />
      <Button type="submit" className="w-full">
        Create expense
      </Button>
    </form>
  )
}
