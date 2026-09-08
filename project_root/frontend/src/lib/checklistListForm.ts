import { toLocalIsoDate } from '@/lib/calendarUtils'
import { isPeriodicList, listPeriodScope, periodStartIsoDate } from '@/lib/checklistPeriods'
import { normalizeFinanceDate } from '@/lib/financeUtils'
import { defaultRecurrenceConfig, parseRecurrenceRule, type RecurrenceConfig } from '@/lib/recurrence'
import type { PeriodScope, TodoList } from '@/lib/types'

export type CheckListKind = 'daily' | 'periodic' | 'recurring' | 'general'

export const CHECK_LIST_KIND_OPTIONS: {
  value: CheckListKind
  label: string
  description: string
}[] = [
  {
    value: 'daily',
    label: 'Daily',
    description:
      'One specific day. Shows in the planner on that date only. Completions apply to that day alone.',
  },
  {
    value: 'periodic',
    label: 'Periodic',
    description:
      'Week, month, or year. The same list appears every day in the period. Checking an item stays checked for the whole period, then resets when the next period starts.',
  },
  {
    value: 'recurring',
    label: 'Recurring',
    description:
      'Custom schedule (for example every Monday and Wednesday). Each matching day gets its own list with separate completions.',
  },
  {
    value: 'general',
    label: 'General',
    description:
      'No planner schedule. A standing list you manage outside daily or periodic planning.',
  },
]

export type CheckListFormState = {
  name: string
  kind: CheckListKind
  date: string
  periodScope: PeriodScope
  recurrence: RecurrenceConfig
}

export type CheckListWritePayload = {
  name: string
  kind?: string
  list_date?: string
  recurrence?: string
  period_scope?: string
}

export function defaultCheckListFormState(today = toLocalIsoDate()): CheckListFormState {
  return {
    name: '',
    kind: 'daily',
    date: today,
    periodScope: 'week',
    recurrence: defaultRecurrenceConfig,
  }
}

export function inferCheckListKind(list: TodoList): CheckListKind {
  if (list.kind === 'general') return 'general'
  if (isPeriodicList(list)) return 'periodic'
  if (list.is_recurring && list.recurrence) return 'recurring'
  return 'daily'
}

export function checkListFormFromList(list: TodoList, today = toLocalIsoDate()): CheckListFormState {
  const kind = inferCheckListKind(list)
  const date = list.list_date ? normalizeFinanceDate(list.list_date) : today
  return {
    name: list.name,
    kind,
    date: date || today,
    periodScope: listPeriodScope(list) ?? 'week',
    recurrence:
      kind === 'recurring' && list.recurrence
        ? parseRecurrenceRule(list.recurrence, date || today)
        : defaultRecurrenceConfig,
  }
}

export function buildCheckListWritePayload(
  form: CheckListFormState,
  recurrenceRule: string,
  today = toLocalIsoDate(),
): CheckListWritePayload | null {
  if (!form.name.trim()) return null

  if (form.kind === 'recurring') {
    if (!recurrenceRule || !form.date) return null
    return {
      name: form.name.trim(),
      list_date: form.date,
      recurrence: recurrenceRule,
    }
  }

  const payload: CheckListWritePayload = {
    name: form.name.trim(),
  }

  if (form.kind === 'periodic') {
    payload.kind = 'periodic'
    payload.period_scope = form.periodScope
    payload.list_date = periodStartIsoDate(form.date || today, form.periodScope)
    return payload
  }

  if (form.kind === 'daily') {
    if (!form.date) return null
    payload.kind = 'daily'
    payload.list_date = form.date
    return payload
  }

  payload.kind = 'general'
  return payload
}
