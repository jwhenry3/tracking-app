import { monthStartIsoDate, weekStartIsoDate, yearStartIsoDate } from '@/lib/calendarUtils'
import { normalizeFinanceDate } from '@/lib/financeUtils'
import type { PeriodScope, TodoList } from '@/lib/types'

export function periodStartIsoDate(date: string, scope: PeriodScope) {
  switch (scope) {
    case 'month':
      return monthStartIsoDate(date)
    case 'year':
      return yearStartIsoDate(date)
    default:
      return weekStartIsoDate(date)
  }
}

export function periodScopeLabel(scope: PeriodScope) {
  switch (scope) {
    case 'month':
      return 'monthly'
    case 'year':
      return 'yearly'
    default:
      return 'weekly'
  }
}

export function periodScopeTitle(scope: PeriodScope) {
  switch (scope) {
    case 'month':
      return 'Month'
    case 'year':
      return 'Year'
    default:
      return 'Week'
  }
}

export function isPeriodicList(list: TodoList) {
  return list.kind === 'periodic' || list.kind === 'weekly'
}

export function listPeriodScope(list: TodoList): PeriodScope | null {
  if (list.period_scope) return list.period_scope
  if (list.kind === 'weekly') return 'week'
  return null
}

export function formatPeriodRange(periodStart: string, scope: PeriodScope) {
  const normalized = normalizeFinanceDate(periodStart)
  if (!normalized) return '—'
  const start = new Date(`${normalized}T12:00:00`)

  if (scope === 'year') {
    return String(start.getFullYear())
  }

  if (scope === 'month') {
    return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: start.getFullYear() === end.getFullYear() ? undefined : 'numeric',
  })
  return `${startLabel} – ${endLabel}`
}

export function currentPeriodStart(scope: PeriodScope, today = new Date()) {
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return periodStartIsoDate(iso, scope)
}
