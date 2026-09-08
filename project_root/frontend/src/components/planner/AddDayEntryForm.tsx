import { type FormEvent, useEffect, useMemo, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import { EventTimeRangeFields } from '@/components/forms/EventTimeRangeFields'
import { defaultRecurrenceConfig, RecurrencePicker } from '@/components/forms/RecurrencePicker'
import { OpsTabs } from '@/components/layout/OperationDialog'
import { entryTypeMeta } from '@/components/ops/EntryTypeIcon'
import { WorkspaceField } from '@/components/workspace/WorkspaceField'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createBill,
  createEvent,
  createExpense,
  createIncome,
} from '@/lib/api'
import {
  buildEventSchedule,
  defaultEventTimeRangeState,
} from '@/lib/eventTimeRange'
import { buildRecurrenceRule } from '@/lib/recurrence'
import { canManageWorkspace, getManageableWorkspaces } from '@/lib/workspacePermissions'
import { useAuthStore } from '@/stores/authStore'

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
  workspaceId: defaultWorkspaceId,
  defaultDate,
  defaultTab = 'event',
  onCreated,
}: AddDayEntryFormProps) {
  const workspaces = useAuthStore((state) => state.workspaces)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(defaultWorkspaceId)
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId)
  const canManagePlanning = canManageWorkspace(selectedWorkspace, 'planning')
  const canManageFinances = canManageWorkspace(selectedWorkspace, 'finances')
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

  const creatableWorkspaces = useMemo(() => {
    const area = formTab === 'event' ? 'planning' : 'finances'
    return getManageableWorkspaces(workspaces, area)
  }, [formTab, workspaces])

  useEffect(() => {
    setSelectedWorkspaceId(defaultWorkspaceId)
  }, [defaultWorkspaceId])

  useEffect(() => {
    if (creatableWorkspaces.some((workspace) => workspace.id === selectedWorkspaceId)) return
    setSelectedWorkspaceId(creatableWorkspaces[0]?.id ?? defaultWorkspaceId)
  }, [creatableWorkspaces, selectedWorkspaceId, defaultWorkspaceId])

  const [eventForm, setEventForm] = useState({
    title: '',
    date: defaultDate,
    description: '',
    recurrence: defaultRecurrenceConfig,
    timeRange: defaultEventTimeRangeState(),
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

    await createEvent(token, selectedWorkspaceId, {
      title: eventForm.title.trim(),
      description: eventForm.description,
      ...buildEventSchedule(eventForm.date, eventForm.timeRange),
      color: '#2563eb',
      recurrence: buildRecurrenceRule(eventForm.recurrence, eventForm.date),
    })

    setEventForm({
      title: '',
      date: defaultDate,
      description: '',
      recurrence: defaultRecurrenceConfig,
      timeRange: defaultEventTimeRangeState(),
    })
    onCreated?.()
  }

  async function submitIncome(event: FormEvent) {
    event.preventDefault()
    if (!incomeForm.title.trim()) return

    await createIncome(token, selectedWorkspaceId, {
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

    await createBill(token, selectedWorkspaceId, {
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

    await createExpense(token, selectedWorkspaceId, {
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
            ? [{
                id: 'event' as const,
                label: 'Event',
                icon: entryTypeMeta.event.icon,
                iconClassName: entryTypeMeta.event.className,
              }]
            : []),
          ...(canManageFinances
            ? [
                { id: 'income' as const, label: 'Income', icon: entryTypeMeta.income.icon, iconClassName: entryTypeMeta.income.className },
                { id: 'bill' as const, label: 'Bill', icon: entryTypeMeta.bill.icon, iconClassName: entryTypeMeta.bill.className },
                { id: 'expense' as const, label: 'Expense', icon: entryTypeMeta.expense.icon, iconClassName: entryTypeMeta.expense.className },
              ]
            : []),
        ]}
        activeTab={formTab}
        onChange={(tabId) => setFormTab(tabId as AddDayEntryTab)}
      />

      {formTab === 'event' ? (
        <form className="mt-4 space-y-4" onSubmit={(event) => void submitEvent(event)}>
          <WorkspaceField
            workspaces={creatableWorkspaces}
            value={selectedWorkspaceId}
            onChange={setSelectedWorkspaceId}
          />
          <FormField label="Title" value={eventForm.title} onChange={(value) => setEventForm((state) => ({ ...state, title: value }))} />
          <FormField label="Date" type="date" value={eventForm.date} onChange={(value) => setEventForm((state) => ({ ...state, date: value }))} />
          <EventTimeRangeFields
            value={eventForm.timeRange}
            onChange={(timeRange) => setEventForm((state) => ({ ...state, timeRange }))}
            idPrefix="day-entry-event-time"
          />
          <RecurrencePicker
            value={eventForm.recurrence}
            anchorDate={eventForm.date}
            onChange={(value) => setEventForm((state) => ({ ...state, recurrence: value }))}
          />
          <div className="space-y-2">
            <Label htmlFor="day-entry-event-description">Description (optional)</Label>
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
          <WorkspaceField
            workspaces={creatableWorkspaces}
            value={selectedWorkspaceId}
            onChange={setSelectedWorkspaceId}
          />
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
          <WorkspaceField
            workspaces={creatableWorkspaces}
            value={selectedWorkspaceId}
            onChange={setSelectedWorkspaceId}
          />
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
          <WorkspaceField
            workspaces={creatableWorkspaces}
            value={selectedWorkspaceId}
            onChange={setSelectedWorkspaceId}
          />
          <FormField label="Title" value={expenseForm.title} onChange={(value) => setExpenseForm((state) => ({ ...state, title: value }))} />
          <FormField label="Amount" type="number" value={expenseForm.amount} onChange={(value) => setExpenseForm((state) => ({ ...state, amount: value }))} />
          <FormField label="Date" type="date" value={expenseForm.date} onChange={(value) => setExpenseForm((state) => ({ ...state, date: value }))} />
          <Button type="submit" className="w-full">Save expense</Button>
        </form>
      ) : null}
    </>
  )
}
