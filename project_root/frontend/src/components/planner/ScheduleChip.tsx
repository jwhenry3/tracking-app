import { type CSSProperties, type ReactNode } from 'react'

import { EntryTypeIcon } from '@/components/ops/EntryTypeIcon'
import { billChipColorValue, scheduleChipColors } from '@/lib/scheduleChipStyles'
import { describeRecurrence } from '@/lib/recurrence'
import type { Bill, Expense, IncomeEntry, PlannerEvent } from '@/lib/types'

function chipMoney(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export type ScheduleChipItem =
  | PlannerEvent
  | (PlannerEvent & { kind: 'event'; date: string })
  | (IncomeEntry & { kind: 'income'; date: string })
  | (Bill & { kind: 'bill'; date: string })
  | (Expense & { kind: 'expense'; date: string })

function itemDate(item: ScheduleChipItem) {
  if (!('kind' in item)) return item.start_at.slice(0, 10)
  return item.date
}

function ScheduleChipShell({
  chipColor,
  kind,
  title,
  workspaceLabel,
  children,
}: {
  chipColor: string
  kind: 'event' | 'income' | 'bill' | 'expense'
  title?: string
  workspaceLabel?: string
  children: ReactNode
}) {
  return (
    <div
      className="schedule-chip"
      style={{ '--schedule-chip-color': chipColor } as CSSProperties}
      title={title}
    >
      <EntryTypeIcon kind={kind} className="h-3 w-3" />
      {workspaceLabel ? (
        <span className="shrink-0 rounded bg-black/10 px-1 text-[10px] font-semibold leading-none">
          {workspaceLabel}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </div>
  )
}

export function ScheduleChip({
  item,
  workspaceLabel,
}: {
  item: ScheduleChipItem
  workspaceLabel?: string
}) {
  if (!('kind' in item) || item.kind === 'event') {
    const event = item
    return (
      <ScheduleChipShell
        chipColor={event.color || scheduleChipColors.event}
        kind="event"
        workspaceLabel={workspaceLabel}
        title={event.is_recurring ? describeRecurrence(event.recurrence, event.start_at.slice(0, 10)) : event.title}
      >
        {event.title}
        {event.is_recurring ? ' ↻' : ''}
      </ScheduleChipShell>
    )
  }

  if (item.kind === 'income') {
    return (
      <ScheduleChipShell
        chipColor={scheduleChipColors.income}
        kind="income"
        workspaceLabel={workspaceLabel}
        title={item.is_recurring ? describeRecurrence(item.recurrence, itemDate(item)) : item.title}
      >
        +{chipMoney(item.amount)} {item.title}
        {item.is_recurring ? ' ↻' : ''}
      </ScheduleChipShell>
    )
  }

  if (item.kind === 'bill') {
    return (
      <ScheduleChipShell
        chipColor={billChipColorValue(item)}
        kind="bill"
        workspaceLabel={workspaceLabel}
        title={item.is_recurring ? describeRecurrence(item.recurrence, itemDate(item)) : item.title}
      >
        {item.paid ? '✓' : item.skipped ? '–' : '!'}{chipMoney(item.amount)} {item.title}
        {item.is_recurring ? ' ↻' : ''}
      </ScheduleChipShell>
    )
  }

  return (
    <ScheduleChipShell
      chipColor={scheduleChipColors.expense}
      kind="expense"
      workspaceLabel={workspaceLabel}
      title={item.title}
    >
      {item.paid ? '✓' : item.skipped ? '–' : '!'}-{chipMoney(item.amount)} {item.title}
    </ScheduleChipShell>
  )
}
