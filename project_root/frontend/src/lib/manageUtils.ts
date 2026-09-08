import type { Bill, BillSeries, EventSeries, Expense, PlannerEvent } from '@/lib/types'

export function billSeriesToBill(series: BillSeries): Bill {
  const anchor = series.series_anchor_date ?? series.due_date
  return {
    series_id: series.id,
    occurrence_id: `${series.id}:${anchor}`,
    id: series.id,
    workspace_id: series.workspace_id,
    title: series.title,
    amount: series.amount,
    due_date: anchor,
    paid: series.paid,
    paid_off: series.paid_off,
    skipped: series.skipped,
    payment_notes: series.payment_notes,
    recurrence: series.recurrence,
    is_recurring: series.is_recurring,
    series_anchor_date: anchor,
    category: series.category,
    created_by: series.created_by,
  }
}

export function eventSeriesToPlannerEvent(series: EventSeries): PlannerEvent {
  const anchor = series.series_anchor_date ?? series.start_at.slice(0, 10)
  return {
    series_id: series.id,
    occurrence_id: `${series.id}:${series.start_at}`,
    id: series.id,
    workspace_id: series.workspace_id,
    title: series.title,
    description: series.description,
    start_at: series.start_at,
    end_at: series.end_at,
    all_day: series.all_day,
    color: series.color,
    recurrence: series.recurrence,
    is_recurring: series.is_recurring,
    series_anchor_date: anchor,
    created_by: series.created_by,
  }
}

export function expenseToEditable(expense: Expense) {
  return { kind: 'expense' as const, data: expense }
}
