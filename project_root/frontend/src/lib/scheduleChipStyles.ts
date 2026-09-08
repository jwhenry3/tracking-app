import { billChipColor } from '@/lib/financeUtils'
import type { Bill } from '@/lib/types'

export const scheduleChipColors = {
  event: '#2563eb',
  income: '#15803d',
  expense: '#64748b',
  billDue: '#dc2626',
  billPaid: '#15803d',
  billSkipped: '#94a3b8',
  checklist: '#7c3aed',
} as const

export function billChipColorValue(bill: Pick<Bill, 'paid' | 'skipped' | 'due_date'>) {
  return billChipColor(bill)
}

export const calendarLegendColors = {
  event: scheduleChipColors.event,
  income: scheduleChipColors.income,
  expense: scheduleChipColors.expense,
  billDue: scheduleChipColors.billDue,
  billPaid: scheduleChipColors.billPaid,
  billSkipped: scheduleChipColors.billSkipped,
} as const
