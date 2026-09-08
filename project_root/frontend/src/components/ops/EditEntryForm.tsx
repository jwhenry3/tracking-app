import { type FormEvent, useEffect, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import { OccurrenceScopePicker } from '@/components/forms/OccurrenceScopePicker'
import { RecurrencePicker } from '@/components/forms/RecurrencePicker'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  deleteBill,
  deleteEvent,
  deleteExpense,
  deleteIncome,
  patchBillOccurrence,
  patchEventOccurrence,
  patchExpense,
  patchIncomeOccurrence,
} from '@/lib/api'
import { normalizeFinanceDate } from '@/lib/financeUtils'
import {
  buildRecurrenceRule,
  defaultRecurrenceConfig,
  parseRecurrenceRule,
  type OccurrenceScope,
  type RecurrenceConfig,
} from '@/lib/recurrence'
import type { Bill, Expense, IncomeEntry, PlannerEvent } from '@/lib/types'

export type EditableEntry =
  | { kind: 'event'; data: PlannerEvent }
  | { kind: 'income'; data: IncomeEntry }
  | { kind: 'bill'; data: Bill }
  | { kind: 'expense'; data: Expense }

type EditEntryFormProps = {
  token: string
  workspaceId: number
  entry: EditableEntry
  defaultScope?: OccurrenceScope
  onSaved: () => void
  onDeleted: () => void
}

export function EditEntryForm({ token, workspaceId, entry, defaultScope, onSaved, onDeleted }: EditEntryFormProps) {
  const isRecurring = entry.kind !== 'expense' && Boolean(getSeriesRule(entry))

  const [scope, setScope] = useState<OccurrenceScope>(defaultScope ?? (isRecurring ? 'this' : 'all'))
  const [title, setTitle] = useState(getTitle(entry))
  const [amount, setAmount] = useState(getAmount(entry))
  const [date, setDate] = useState(getDate(entry))
  const [description, setDescription] = useState(entry.kind === 'event' ? entry.data.description : '')
  const [notes, setNotes] = useState(entry.kind === 'income' ? entry.data.notes : entry.kind === 'expense' ? entry.data.notes : '')
  const [category, setCategory] = useState(entry.kind === 'bill' ? entry.data.category : entry.kind === 'expense' ? entry.data.category : 'general')
  const [paid, setPaid] = useState(entry.kind === 'bill' ? entry.data.paid : false)
  const [paidOff, setPaidOff] = useState(entry.kind === 'bill' ? Boolean(entry.data.paid_off) : false)
  const [recurrence, setRecurrence] = useState<RecurrenceConfig>(() => buildRecurrenceState(entry))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const nextDate = getDate(entry)
    setScope(defaultScope ?? (isRecurring ? 'this' : 'all'))
    setTitle(getTitle(entry))
    setAmount(getAmount(entry))
    setDate(nextDate)
    setDescription(entry.kind === 'event' ? entry.data.description : '')
    setNotes(entry.kind === 'income' ? entry.data.notes : entry.kind === 'expense' ? entry.data.notes : '')
    setCategory(entry.kind === 'bill' ? entry.data.category : entry.kind === 'expense' ? entry.data.category : 'general')
    setPaid(entry.kind === 'bill' ? entry.data.paid : false)
    setPaidOff(entry.kind === 'bill' ? Boolean(entry.data.paid_off) : false)
    setRecurrence(buildRecurrenceState(entry))
  }, [entry, isRecurring, defaultScope])

  const recurrenceReadOnly = isRecurring && scope === 'this'
  const recurrenceAnchorDate = getRecurrenceAnchorDate(entry, date)

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      const effectiveScope = isRecurring ? scope : 'all'
      const recurrenceRule = resolveRecurrencePayload(effectiveScope, recurrence, recurrenceAnchorDate)

      if (entry.kind === 'event') {
        await patchEventOccurrence(token, workspaceId, entry.data, {
          scope: effectiveScope,
          title: title.trim(),
          description,
          start_at: `${date}T09:00:00Z`,
          end_at: `${date}T10:00:00Z`,
          recurrence: recurrenceRule,
        })
      } else if (entry.kind === 'income') {
        await patchIncomeOccurrence(token, workspaceId, entry.data, {
          scope: effectiveScope,
          title: title.trim(),
          amount: Number(amount),
          date,
          notes,
          recurrence: recurrenceRule,
        })
      } else if (entry.kind === 'bill') {
        await patchBillOccurrence(token, workspaceId, entry.data, {
          scope: effectiveScope,
          title: title.trim(),
          amount: Number(amount),
          date,
          category,
          paid,
          paid_off: paidOff,
          recurrence: recurrenceRule,
        })
      } else {
        await patchExpense(token, workspaceId, entry.data.id, {
          title: title.trim(),
          amount: Number(amount),
          date,
          category,
          notes,
        })
      }
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      const deleteScope = isRecurring ? scope : 'all'
      if (entry.kind === 'event') {
        await deleteEvent(token, workspaceId, entry.data, deleteScope)
      } else if (entry.kind === 'income') {
        await deleteIncome(token, workspaceId, entry.data, deleteScope)
      } else if (entry.kind === 'bill') {
        await deleteBill(token, workspaceId, entry.data, deleteScope)
      } else {
        await deleteExpense(token, workspaceId, entry.data.id)
      }
      onDeleted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSave(event)}>
      <OccurrenceScopePicker
        value={scope}
        onChange={setScope}
        recurring={isRecurring}
        entryLabel={entry.kind === 'bill' || entry.kind === 'income' ? 'occurrence' : 'event'}
      />

      <FormField label="Title" value={title} onChange={setTitle} id="edit-entry-title" />

      {entry.kind !== 'event' ? (
        <FormField label="Amount" type="number" value={amount} onChange={setAmount} id="edit-entry-amount" />
      ) : null}

      <FormField
        label={entry.kind === 'bill' ? 'Due date' : 'Date'}
        type="date"
        value={date}
        onChange={setDate}
        id="edit-entry-date"
      />

      {entry.kind === 'event' ? (
        <div className="space-y-2">
          <Label htmlFor="edit-entry-description">Description</Label>
          <Textarea
            id="edit-entry-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      ) : null}

      {entry.kind === 'income' || entry.kind === 'expense' ? (
        <FormField label="Notes" value={notes} onChange={setNotes} id="edit-entry-notes" />
      ) : null}

      {entry.kind === 'bill' || entry.kind === 'expense' ? (
        <FormField label="Category" value={category} onChange={setCategory} id="edit-entry-category" />
      ) : null}

      {entry.kind === 'bill' ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} />
            Mark as paid
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={paidOff} onChange={(event) => setPaidOff(event.target.checked)} />
            Mark as paid off
          </label>
          <p className="text-xs text-muted-foreground">
            Paid off bills are hidden from the calendar and current bill views.
          </p>
        </div>
      ) : null}

      {entry.kind !== 'expense' ? (
        <RecurrencePicker
          value={recurrence}
          anchorDate={recurrenceAnchorDate}
          seriesRule={getSeriesRule(entry)}
          onChange={setRecurrence}
          readOnly={recurrenceReadOnly}
        />
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={busy}>Save changes</Button>
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
          Delete
        </Button>
      </div>
    </form>
  )
}

function getTitle(entry: EditableEntry) {
  return entry.data.title
}

function getAmount(entry: EditableEntry) {
  if (entry.kind === 'income') return String(entry.data.amount)
  if (entry.kind === 'bill') return String(entry.data.amount)
  if (entry.kind === 'expense') return String(entry.data.amount)
  return ''
}

function getDate(entry: EditableEntry) {
  if (entry.kind === 'event') return normalizeFinanceDate(entry.data.start_at)
  if (entry.kind === 'income') return normalizeFinanceDate(entry.data.entry_date)
  if (entry.kind === 'bill') return normalizeFinanceDate(entry.data.due_date)
  return normalizeFinanceDate(entry.data.expense_date)
}

function getSeriesRule(entry: EditableEntry) {
  if (entry.kind === 'expense') return ''
  return entry.data.recurrence ?? ''
}

function getRecurrenceAnchorDate(entry: EditableEntry, occurrenceDate: string) {
  if (entry.kind === 'event') {
    return normalizeFinanceDate(entry.data.series_anchor_date ?? entry.data.start_at)
  }
  if (entry.kind === 'income') {
    return normalizeFinanceDate(entry.data.series_anchor_date ?? entry.data.entry_date)
  }
  if (entry.kind === 'bill') {
    return normalizeFinanceDate(entry.data.series_anchor_date ?? entry.data.due_date)
  }
  return occurrenceDate
}

function buildRecurrenceState(entry: EditableEntry): RecurrenceConfig {
  if (entry.kind === 'expense') return defaultRecurrenceConfig
  const rule = getSeriesRule(entry)
  if (!rule) return defaultRecurrenceConfig
  return parseRecurrenceRule(rule, getRecurrenceAnchorDate(entry, getDate(entry)))
}

function resolveRecurrencePayload(scope: OccurrenceScope, config: RecurrenceConfig, anchorDate: string) {
  if (config.preset === 'none') {
    return scope === 'all' || scope === 'following' ? '' : undefined
  }
  if (scope === 'this') return undefined
  return buildRecurrenceRule(config, anchorDate) || undefined
}
