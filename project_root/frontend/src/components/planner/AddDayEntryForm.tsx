import { type FormEvent, useEffect, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import { defaultRecurrenceConfig, RecurrencePicker } from '@/components/forms/RecurrencePicker'
import { OpsTabs } from '@/components/layout/OperationDialog'
import { entryTypeMeta } from '@/components/ops/EntryTypeIcon'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createBill,
  createEvent,
  createExpense,
  createIncome,
} from '@/lib/api'
import { buildRecurrenceRule } from '@/lib/recurrence'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'

export type AddDayEntryTab = 'event' | 'income' | 'bill' | 'expense'

type AddDayEntryFormProps = {
  token: string
  workspaceId: number
  defaultDate: string
  defaultTab?: AddDayEntryTab
  onCreated?: () => void
}

export function AddDayEntryForm({
  token,
  workspaceId,
  defaultDate,
  defaultTab = 'event',
  onCreated,
}: AddDayEntryFormProps) {
  const { canManagePlanning, canManageFinances } = useWorkspacePermissions()
  const allowedTabs = (
    [
      canManagePlanning ? 'event' : null,
      canManageFinances ? 'income' : null,
      canManageFinances ? 'bill' : null,
      canManageFinances ? 'expense' : null,
    ] as Array<AddDayEntryTab | null>
  ).filter((tab): tab is AddDayEntryTab => tab !== null)
  const initialTab = allowedTabs.includes(defaultTab) ? defaultTab : allowedTabs[0] ?? defaultTab
  const [formTab, setFormTab] = useState<AddDayEntryTab>(initialTab)

  const [eventForm, setEventForm] = useState({
    title: '',
    date: defaultDate,
    description: '',
    recurrence: defaultRecurrenceConfig,
  })
  const [incomeForm, setIncomeForm] = useState({
    title: '',
    amount: '',
    date: defaultDate,
    recurrence: defaultRecurrenceConfig,
  })
  const [billForm, setBillForm] = useState({
    title: '',
    amount: '',
    date: defaultDate,
    category: 'utilities',
    recurrence: defaultRecurrenceConfig,
  })
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    amount: '',
    date: defaultDate,
    category: 'general',
  })

  useEffect(() => {
    setFormTab(allowedTabs.includes(defaultTab) ? defaultTab : allowedTabs[0] ?? defaultTab)
    setEventForm((state) => ({ ...state, date: defaultDate }))
    setIncomeForm((state) => ({ ...state, date: defaultDate }))
    setBillForm((state) => ({ ...state, date: defaultDate }))
    setExpenseForm((state) => ({ ...state, date: defaultDate }))
  }, [defaultDate, defaultTab, canManagePlanning, canManageFinances])

  async function submitEvent(event: FormEvent) {
    event.preventDefault()
    if (!eventForm.title.trim()) return

    await createEvent(token, workspaceId, {
      title: eventForm.title.trim(),
      description: eventForm.description,
      start_at: `${eventForm.date}T09:00:00Z`,
      end_at: `${eventForm.date}T10:00:00Z`,
      all_day: true,
      color: '#2563eb',
      recurrence: buildRecurrenceRule(eventForm.recurrence, eventForm.date),
    })

    setEventForm({ title: '', date: defaultDate, description: '', recurrence: defaultRecurrenceConfig })
    onCreated?.()
  }

  async function submitIncome(event: FormEvent) {
    event.preventDefault()
    if (!incomeForm.title.trim()) return

    await createIncome(token, workspaceId, {
      title: incomeForm.title,
      amount: Number(incomeForm.amount),
      date: incomeForm.date,
      recurrence: buildRecurrenceRule(incomeForm.recurrence, incomeForm.date),
    })

    setIncomeForm({ title: '', amount: '', date: defaultDate, recurrence: defaultRecurrenceConfig })
    onCreated?.()
  }

  async function submitBill(event: FormEvent) {
    event.preventDefault()
    if (!billForm.title.trim()) return

    await createBill(token, workspaceId, {
      title: billForm.title,
      amount: Number(billForm.amount),
      date: billForm.date,
      category: billForm.category,
      recurrence: buildRecurrenceRule(billForm.recurrence, billForm.date),
    })

    setBillForm({
      title: '',
      amount: '',
      date: defaultDate,
      category: billForm.category,
      recurrence: defaultRecurrenceConfig,
    })
    onCreated?.()
  }

  async function submitExpense(event: FormEvent) {
    event.preventDefault()
    if (!expenseForm.title.trim()) return

    await createExpense(token, workspaceId, {
      title: expenseForm.title,
      amount: Number(expenseForm.amount),
      date: expenseForm.date,
      category: expenseForm.category,
    })

    setExpenseForm({ title: '', amount: '', date: defaultDate, category: expenseForm.category })
    onCreated?.()
  }

  return (
    <>
      <OpsTabs
        tabs={[
          ...(canManagePlanning
            ? [{ id: 'event' as const, label: 'Event', icon: entryTypeMeta.event.icon }]
            : []),
          ...(canManageFinances
            ? [
                { id: 'income' as const, label: 'Income', icon: entryTypeMeta.income.icon },
                { id: 'bill' as const, label: 'Bill', icon: entryTypeMeta.bill.icon },
                { id: 'expense' as const, label: 'Expense', icon: entryTypeMeta.expense.icon },
              ]
            : []),
        ]}
        activeTab={formTab}
        onChange={(tabId) => setFormTab(tabId as AddDayEntryTab)}
      />

      {formTab === 'event' ? (
        <form className="mt-4 space-y-4" onSubmit={(event) => void submitEvent(event)}>
          <FormField label="Title" value={eventForm.title} onChange={(value) => setEventForm((state) => ({ ...state, title: value }))} />
          <FormField label="Date" type="date" value={eventForm.date} onChange={(value) => setEventForm((state) => ({ ...state, date: value }))} />
          <RecurrencePicker
            value={eventForm.recurrence}
            anchorDate={eventForm.date}
            onChange={(value) => setEventForm((state) => ({ ...state, recurrence: value }))}
          />
          <div className="space-y-2">
            <Label htmlFor="day-entry-event-description">Description</Label>
            <Textarea
              id="day-entry-event-description"
              value={eventForm.description}
              onChange={(event) => setEventForm((state) => ({ ...state, description: event.target.value }))}
            />
          </div>
          <Button type="submit" className="w-full">Create event</Button>
        </form>
      ) : null}

      {formTab === 'income' ? (
        <form className="mt-4 space-y-4" onSubmit={(event) => void submitIncome(event)}>
          <FormField label="Title" value={incomeForm.title} onChange={(value) => setIncomeForm((state) => ({ ...state, title: value }))} />
          <FormField label="Amount" type="number" value={incomeForm.amount} onChange={(value) => setIncomeForm((state) => ({ ...state, amount: value }))} />
          <FormField label="Date" type="date" value={incomeForm.date} onChange={(value) => setIncomeForm((state) => ({ ...state, date: value }))} />
          <RecurrencePicker
            value={incomeForm.recurrence}
            anchorDate={incomeForm.date}
            onChange={(value) => setIncomeForm((state) => ({ ...state, recurrence: value }))}
          />
          <Button type="submit" className="w-full">Save income</Button>
        </form>
      ) : null}

      {formTab === 'bill' ? (
        <form className="mt-4 space-y-4" onSubmit={(event) => void submitBill(event)}>
          <FormField label="Title" value={billForm.title} onChange={(value) => setBillForm((state) => ({ ...state, title: value }))} />
          <FormField label="Amount" type="number" value={billForm.amount} onChange={(value) => setBillForm((state) => ({ ...state, amount: value }))} />
          <FormField label="Due date" type="date" value={billForm.date} onChange={(value) => setBillForm((state) => ({ ...state, date: value }))} />
          <RecurrencePicker
            value={billForm.recurrence}
            anchorDate={billForm.date}
            onChange={(value) => setBillForm((state) => ({ ...state, recurrence: value }))}
          />
          <Button type="submit" className="w-full">Save bill</Button>
        </form>
      ) : null}

      {formTab === 'expense' ? (
        <form className="mt-4 space-y-4" onSubmit={(event) => void submitExpense(event)}>
          <FormField label="Title" value={expenseForm.title} onChange={(value) => setExpenseForm((state) => ({ ...state, title: value }))} />
          <FormField label="Amount" type="number" value={expenseForm.amount} onChange={(value) => setExpenseForm((state) => ({ ...state, amount: value }))} />
          <FormField label="Date" type="date" value={expenseForm.date} onChange={(value) => setExpenseForm((state) => ({ ...state, date: value }))} />
          <Button type="submit" className="w-full">Save expense</Button>
        </form>
      ) : null}
    </>
  )
}
