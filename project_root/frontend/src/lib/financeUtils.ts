import type { Bill, Expense, IncomeEntry } from '@/lib/types'

export function money(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value)
}

export type BillPaymentStatus = 'due' | 'paid' | 'skipped'

export const financeGreen = '#15803d'
export const paidBadgeClass = 'bg-[#15803d] text-white'
export const pastDueBadgeClass = 'bg-[#dc2626] text-white'
export const dueSoonBadgeClass = 'bg-[#ca8a04] text-white'
export const typeBadgeClass = 'bg-secondary text-secondary-foreground'
export const skippedBadgeClass = 'bg-secondary text-secondary-foreground'

export function billPaymentStatus(bill: Pick<Bill, 'paid' | 'skipped'>): BillPaymentStatus {
  if (bill.skipped) return 'skipped'
  if (bill.paid) return 'paid'
  return 'due'
}

export function billBadgeClass(status: BillPaymentStatus) {
  switch (status) {
    case 'paid':
      return paidBadgeClass
    case 'skipped':
      return 'bg-secondary text-secondary-foreground'
    default:
      return 'bg-[#dc2626] text-white'
  }
}

export function billCalendarColor(status: BillPaymentStatus) {
  switch (status) {
    case 'paid':
      return financeGreen
    case 'skipped':
      return '#94a3b8'
    default:
      return '#dc2626'
  }
}

export function billChipColor(
  bill: Pick<Bill, 'paid' | 'skipped' | 'due_date'>,
  referenceDate = todayIso(),
) {
  if (bill.paid) return financeGreen
  if (bill.skipped) return '#94a3b8'
  switch (dueDateUrgency(bill.due_date, referenceDate)) {
    case 'overdue':
      return '#dc2626'
    case 'due-soon':
      return '#ca8a04'
    default:
      return '#15803d'
  }
}

export function billStatusLabel(status: BillPaymentStatus) {
  switch (status) {
    case 'paid':
      return 'Bill paid'
    case 'skipped':
      return 'Bill skipped'
    default:
      return 'Bill due'
  }
}

export function billAmountClass(status: BillPaymentStatus) {
  return status === 'due' ? 'text-foreground' : 'text-muted-foreground'
}

export type TimelineTone = 'overdue' | 'due-soon' | 'upcoming' | 'positive' | 'settled' | 'inactive'

export function daysUntilDue(date: string, referenceDate = todayIso()) {
  const from = new Date(`${normalizeFinanceDate(referenceDate)}T12:00:00`)
  const to = new Date(`${normalizeFinanceDate(date)}T12:00:00`)
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

export function dueDateUrgency(date: string, referenceDate = todayIso()): 'overdue' | 'due-soon' | 'upcoming' {
  const days = daysUntilDue(date, referenceDate)
  if (days < 0) return 'overdue'
  if (days <= 14) return 'due-soon'
  return 'upcoming'
}

export function timelineTone(item: FinanceTimelineItem, referenceDate = todayIso()): TimelineTone {
  if (item.kind === 'income') return 'positive'
  if (item.kind === 'bill') {
    const status = billPaymentStatus(item.data)
    if (status === 'skipped') return 'inactive'
    if (status === 'paid') return 'settled'
    return dueDateUrgency(item.date, referenceDate)
  }
  if (item.skipped) return 'inactive'
  if (item.paid) return 'settled'
  return dueDateUrgency(item.date, referenceDate)
}

const timelineTonePriority: Record<TimelineTone, number> = {
  overdue: 6,
  'due-soon': 5,
  upcoming: 4,
  positive: 3,
  settled: 2,
  inactive: 1,
}

export function timelineDayTone(items: FinanceTimelineItem[], referenceDate = todayIso()): TimelineTone {
  return items.reduce<TimelineTone>((current, item) => {
    const tone = timelineTone(item, referenceDate)
    return timelineTonePriority[tone] > timelineTonePriority[current] ? tone : current
  }, 'inactive')
}

export function timelineToneClass(tone: TimelineTone) {
  switch (tone) {
    case 'positive':
    case 'upcoming':
      return 'border-[#15803d]/20 bg-[#15803d]/8'
    case 'overdue':
      return 'border-[#dc2626]/25 bg-[#dc2626]/8'
    case 'due-soon':
      return 'border-[#ca8a04]/30 bg-[#ca8a04]/10'
    case 'settled':
      return 'border-border/70 bg-muted/25'
    case 'inactive':
      return 'border-border/50 bg-muted/10'
  }
}

export function timelineDayClass(items: FinanceTimelineItem[], referenceDate = todayIso()) {
  return timelineToneClass(timelineDayTone(items, referenceDate))
}

export function timelineDotClass(tone: TimelineTone) {
  switch (tone) {
    case 'positive':
    case 'upcoming':
      return 'bg-[#15803d]'
    case 'overdue':
      return 'bg-[#dc2626]'
    case 'due-soon':
      return 'bg-[#ca8a04]'
    case 'settled':
      return 'bg-muted-foreground/60'
    case 'inactive':
      return 'bg-muted-foreground/40'
  }
}

export function timelineTypeLabel(item: FinanceTimelineItem) {
  switch (item.kind) {
    case 'income':
      return 'Income'
    case 'bill':
      return 'Bill'
    case 'expense':
      return 'Expense'
  }
}

export function timelineShowPaidBadge(item: FinanceTimelineItem) {
  return (item.kind === 'bill' || item.kind === 'expense') && item.paid
}

export function timelineShowSkippedBadge(item: FinanceTimelineItem) {
  return (item.kind === 'bill' || item.kind === 'expense') && item.skipped
}

export function isPastDue(date: string, referenceDate = todayIso()) {
  return dueDateUrgency(date, referenceDate) === 'overdue'
}

export function isDueSoon(date: string, referenceDate = todayIso()) {
  return dueDateUrgency(date, referenceDate) === 'due-soon'
}

export function isPastDueBill(bill: Pick<Bill, 'due_date' | 'paid' | 'skipped'>, referenceDate = todayIso()) {
  return !bill.paid && !bill.skipped && isPastDue(bill.due_date, referenceDate)
}

export function isDueSoonBill(bill: Pick<Bill, 'due_date' | 'paid' | 'skipped'>, referenceDate = todayIso()) {
  return !bill.paid && !bill.skipped && isDueSoon(bill.due_date, referenceDate)
}

export function isPastDueExpense(
  expense: Pick<Expense, 'expense_date' | 'paid' | 'skipped'>,
  referenceDate = todayIso(),
) {
  return !expense.paid && !expense.skipped && isPastDue(expense.expense_date, referenceDate)
}

export function isDueSoonExpense(
  expense: Pick<Expense, 'expense_date' | 'paid' | 'skipped'>,
  referenceDate = todayIso(),
) {
  return !expense.paid && !expense.skipped && isDueSoon(expense.expense_date, referenceDate)
}

export function timelineShowPastDueBadge(item: FinanceTimelineItem, referenceDate = todayIso()) {
  if (item.kind !== 'bill' && item.kind !== 'expense') return false
  if (item.paid || item.skipped) return false
  return isPastDue(item.date, referenceDate)
}

export function timelineShowDueSoonBadge(item: FinanceTimelineItem, referenceDate = todayIso()) {
  if (item.kind !== 'bill' && item.kind !== 'expense') return false
  if (item.paid || item.skipped) return false
  return isDueSoon(item.date, referenceDate)
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return {
    start: `${start.toISOString().slice(0, 10)}T00:00:00Z`,
    end: `${end.toISOString().slice(0, 10)}T23:59:59Z`,
    label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  }
}

export function extendedFinanceRange(monthsBack = 5, monthsForward = 3, date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth() - monthsBack, 1)
  const end = new Date(date.getFullYear(), date.getMonth() + monthsForward + 1, 0)
  return {
    start: `${start.toISOString().slice(0, 10)}T00:00:00Z`,
    end: `${end.toISOString().slice(0, 10)}T23:59:59Z`,
  }
}

export function normalizeFinanceDate(value?: string | null) {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  const datePrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
  if (datePrefix) return datePrefix[1]

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

export function monthKey(date: string) {
  return normalizeFinanceDate(date).slice(0, 7)
}

export function formatMonthLabel(key: string) {
  const normalized = normalizeFinanceDate(`${key}-01`)
  if (!normalized) return key
  const [year, month] = normalized.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}

export function formatDayLabel(date?: string | null) {
  const normalized = normalizeFinanceDate(date)
  if (!normalized) return '—'
  return new Date(`${normalized}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export type FinanceTimelineItem =
  | { kind: 'income'; date: string; title: string; amount: number; data: IncomeEntry }
  | { kind: 'bill'; date: string; title: string; amount: number; paid: boolean; skipped: boolean; data: Bill }
  | { kind: 'expense'; date: string; title: string; amount: number; paid: boolean; skipped: boolean; data: Expense }

export function buildTimelineItems(
  income: IncomeEntry[],
  bills: Bill[],
  expenses: Expense[],
  fromDate: string,
  toDate: string,
): FinanceTimelineItem[] {
  const items: FinanceTimelineItem[] = [
    ...income
      .filter((item) => {
        const entryDate = normalizeFinanceDate(item.entry_date)
        return entryDate >= fromDate && entryDate <= toDate
      })
      .map((item) => ({
        kind: 'income' as const,
        date: normalizeFinanceDate(item.entry_date),
        title: item.title,
        amount: item.amount,
        data: item,
      })),
    ...bills
      .filter((item) => {
        const dueDate = normalizeFinanceDate(item.due_date)
        return dueDate >= fromDate && dueDate <= toDate
      })
      .map((item) => ({
        kind: 'bill' as const,
        date: normalizeFinanceDate(item.due_date),
        title: item.title,
        amount: item.amount,
        paid: item.paid,
        skipped: Boolean(item.skipped),
        data: item,
      })),
    ...expenses
      .filter((item) => {
        const expenseDate = normalizeFinanceDate(item.expense_date)
        return expenseDate >= fromDate && expenseDate <= toDate
      })
      .map((item) => ({
        kind: 'expense' as const,
        date: normalizeFinanceDate(item.expense_date),
        title: item.title,
        amount: item.amount,
        paid: item.paid,
        skipped: Boolean(item.skipped),
        data: item,
      })),
  ]

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

export function findNextIncome(income: IncomeEntry[], fromDate = todayIso()) {
  return income
    .filter((item) => normalizeFinanceDate(item.entry_date) >= fromDate)
    .sort((a, b) => normalizeFinanceDate(a.entry_date).localeCompare(normalizeFinanceDate(b.entry_date)))[0] ?? null
}

export function findLastIncome(income: IncomeEntry[], beforeDate = todayIso()) {
  return income
    .filter((item) => normalizeFinanceDate(item.entry_date) <= beforeDate)
    .sort((a, b) => normalizeFinanceDate(b.entry_date).localeCompare(normalizeFinanceDate(a.entry_date)))[0] ?? null
}

export type RunwaySnapshot = {
  nextIncome: IncomeEntry | null
  lastIncome: IncomeEntry | null
  windowStart: string
  windowEnd: string | null
  bills: Bill[]
  expenses: Expense[]
  billsTotal: number
  expensesTotal: number
  projectedRemaining: number | null
}

export function buildRunwaySnapshot(
  income: IncomeEntry[],
  bills: Bill[],
  expenses: Expense[],
  fromDate = todayIso(),
): RunwaySnapshot {
  const nextIncome = findNextIncome(income, fromDate)
  const lastIncome = findLastIncome(income, fromDate)
  const windowStart = fromDate
  const windowEnd = nextIncome ? normalizeFinanceDate(nextIncome.entry_date) : null

  const billsInWindow = bills.filter((bill) => {
    const dueDate = normalizeFinanceDate(bill.due_date)
    if (bill.paid || bill.skipped) return false
    if (dueDate < windowStart) return false
    if (windowEnd && dueDate > windowEnd) return false
    return true
  })

  const expensesInWindow = expenses.filter((expense) => {
    const expenseDate = normalizeFinanceDate(expense.expense_date)
    if (expense.paid || expense.skipped) return false
    if (expenseDate < windowStart) return false
    if (windowEnd && expenseDate > windowEnd) return false
    return true
  })

  const billsTotal = billsInWindow.reduce((sum, bill) => sum + bill.amount, 0)
  const expensesTotal = expensesInWindow.reduce((sum, expense) => sum + expense.amount, 0)
  const projectedRemaining = nextIncome ? nextIncome.amount - billsTotal - expensesTotal : null

  return {
    nextIncome,
    lastIncome,
    windowStart,
    windowEnd,
    bills: billsInWindow.sort((a, b) => normalizeFinanceDate(a.due_date).localeCompare(normalizeFinanceDate(b.due_date))),
    expenses: expensesInWindow.sort((a, b) => normalizeFinanceDate(a.expense_date).localeCompare(normalizeFinanceDate(b.expense_date))),
    billsTotal,
    expensesTotal,
    projectedRemaining,
  }
}

export type MonthlyFinanceTotals = {
  key: string
  label: string
  income: number
  bills: number
  expenses: number
  net: number
}

export function buildMonthlyTotals(
  income: IncomeEntry[],
  bills: Bill[],
  expenses: Expense[],
  monthKeys: string[],
): MonthlyFinanceTotals[] {
  return monthKeys.map((key) => {
    const monthIncome = income
      .filter((item) => monthKey(item.entry_date) === key)
      .reduce((sum, item) => sum + item.amount, 0)
    const monthBills = bills
      .filter((item) => monthKey(item.due_date) === key && !item.skipped)
      .reduce((sum, item) => sum + item.amount, 0)
    const monthExpenses = expenses
      .filter((item) => monthKey(item.expense_date) === key && !item.skipped)
      .reduce((sum, item) => sum + item.amount, 0)

    return {
      key,
      label: formatMonthLabel(key),
      income: monthIncome,
      bills: monthBills,
      expenses: monthExpenses,
      net: monthIncome - monthBills - monthExpenses,
    }
  })
}

export function recentMonthKeys(count: number, date = new Date()) {
  const keys: string[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(date.getFullYear(), date.getMonth() - offset, 1)
    keys.push(monthKey(monthDate.toISOString().slice(0, 10)))
  }
  return keys
}

export function expenseCategoryTotals(expenses: Expense[]) {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    if (expense.skipped) continue
    const category = expense.category || 'general'
    totals.set(category, (totals.get(category) ?? 0) + expense.amount)
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}
