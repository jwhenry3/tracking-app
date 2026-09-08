import type { Bill, Expense, IncomeEntry, PlannerEvent } from '@/lib/types'

export type CalendarIncomeItem = IncomeEntry & { kind: 'income'; date: string }
export type CalendarBillItem = Bill & { kind: 'bill'; date: string }
export type CalendarExpenseItem = Expense & { kind: 'expense'; date: string }
export type CalendarEventItem = PlannerEvent & { kind: 'event'; date: string }

export type CalendarItem = CalendarEventItem | CalendarIncomeItem | CalendarBillItem | CalendarExpenseItem

export type CentralCalendarItem = CalendarItem & {
  workspaceId: number
  workspaceName: string
}
