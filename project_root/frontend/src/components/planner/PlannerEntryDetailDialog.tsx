import { Pencil } from 'lucide-react'

import { BillEntryActions } from '@/components/finance/BillEntryActions'
import { ExpenseEntryActions } from '@/components/finance/ExpenseEntryActions'
import { OperationDialog } from '@/components/layout/OperationDialog'
import { EntryTypeIcon } from '@/components/ops/EntryTypeIcon'
import type { EditableEntry } from '@/components/ops/EditEntryForm'
import type { PlannerScheduleItem } from '@/components/planner/PlannerScheduleRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  dueSoonBadgeClass,
  formatDayLabel,
  isDueSoon,
  isPastDue,
  pastDueBadgeClass,
  signedMoney,
  signedMoneyTextClass,
} from '@/lib/financeUtils'
import { formatEventTimeRange, isPlannerEvent } from '@/lib/plannerTimelineUtils'
import { describeRecurrence } from '@/lib/recurrence'
import { cn } from '@/lib/utils'
import { ManageActions } from '@/lib/workspacePermissions'

type PlannerEntryDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PlannerScheduleItem | null
  onEdit: (entry: EditableEntry) => void
  onPay: (entry: Extract<EditableEntry, { kind: 'bill' }>['data']) => void
  onPayExpense: (entry: Extract<EditableEntry, { kind: 'expense' }>['data']) => void
}

function scheduleItemTitle(item: PlannerScheduleItem) {
  return item.title
}

function scheduleItemDateLabel(item: PlannerScheduleItem) {
  if (isPlannerEvent(item)) {
    if (item.all_day) {
      return `${formatDayLabel(item.start_at.slice(0, 10))} · All day`
    }
    return `${formatDayLabel(item.start_at.slice(0, 10))} · ${formatEventTimeRange(item)}`
  }
  return formatDayLabel(item.date)
}

export function PlannerEntryDetailDialog({
  open,
  onOpenChange,
  item,
  onEdit,
  onPay,
  onPayExpense,
}: PlannerEntryDetailDialogProps) {
  if (!item) return null

  if (isPlannerEvent(item)) {
    return (
      <OperationDialog
        open={open}
        onOpenChange={onOpenChange}
        title={scheduleItemTitle(item)}
        description={scheduleItemDateLabel(item)}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <EntryTypeIcon kind="event" variant="badge" />
            <div className="min-w-0 space-y-2">
              {item.description ? (
                <p className="text-sm text-muted-foreground">{item.description}</p>
              ) : null}
              {item.is_recurring && item.recurrence ? (
                <p className="text-xs text-muted-foreground">
                  {describeRecurrence(item.recurrence, item.start_at.slice(0, 10))}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end border-t pt-4">
            <ManageActions area="planning">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false)
                  onEdit({ kind: 'event', data: item })
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </ManageActions>
          </div>
        </div>
      </OperationDialog>
    )
  }

  if (item.kind === 'income') {
    return (
      <OperationDialog
        open={open}
        onOpenChange={onOpenChange}
        title={item.title}
        description={scheduleItemDateLabel(item)}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <EntryTypeIcon kind="income" variant="badge" />
            <div className="min-w-0 space-y-2">
              <p className={cn('text-sm font-medium', signedMoneyTextClass('income'))}>
                {signedMoney('income', item.amount)}
              </p>
              {item.notes ? <p className="text-sm text-muted-foreground">{item.notes}</p> : null}
              {item.is_recurring && item.recurrence ? (
                <p className="text-xs text-muted-foreground">
                  {describeRecurrence(item.recurrence, item.date)}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end border-t pt-4">
            <ManageActions area="finances">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false)
                  onEdit({ kind: 'income', data: item })
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </ManageActions>
          </div>
        </div>
      </OperationDialog>
    )
  }

  if (item.kind === 'bill') {
    return (
      <OperationDialog
        open={open}
        onOpenChange={onOpenChange}
        title={item.title}
        description={scheduleItemDateLabel(item)}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <EntryTypeIcon kind="bill" variant="badge" />
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn('text-sm font-medium', signedMoneyTextClass('bill'))}>
                  {signedMoney('bill', item.amount)}
                </p>
                {!item.paid && !item.skipped && isPastDue(item.date) ? (
                  <Badge className={`text-xs ${pastDueBadgeClass}`}>Past due</Badge>
                ) : null}
                {!item.paid && !item.skipped && isDueSoon(item.date) ? (
                  <Badge className={`text-xs ${dueSoonBadgeClass}`}>Due soon</Badge>
                ) : null}
                {item.skipped ? (
                  <Badge className="bg-secondary text-xs text-secondary-foreground">Skipped</Badge>
                ) : null}
              </div>
              {item.is_recurring && item.recurrence ? (
                <p className="text-xs text-muted-foreground">
                  {describeRecurrence(item.recurrence, item.date)}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end border-t pt-4">
            <BillEntryActions
              bill={item}
              onPay={() => {
                onOpenChange(false)
                onPay(item)
              }}
              onEdit={() => {
                onOpenChange(false)
                onEdit({ kind: 'bill', data: item })
              }}
            />
          </div>
        </div>
      </OperationDialog>
    )
  }

  return (
    <OperationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item.title}
      description={scheduleItemDateLabel(item)}
      className="max-w-lg"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <EntryTypeIcon kind="expense" variant="badge" />
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn('text-sm font-medium', signedMoneyTextClass('expense'))}>
                {signedMoney('expense', item.amount)}
              </p>
              {item.skipped ? (
                <Badge className="bg-secondary text-xs text-secondary-foreground">Skipped</Badge>
              ) : null}
            </div>
            {item.notes ? <p className="text-sm text-muted-foreground">{item.notes}</p> : null}
          </div>
        </div>
        <div className="flex justify-end border-t pt-4">
          <ExpenseEntryActions
            expense={item}
            onPay={() => {
              onOpenChange(false)
              onPayExpense(item)
            }}
            onEdit={() => {
              onOpenChange(false)
              onEdit({ kind: 'expense', data: item })
            }}
          />
        </div>
      </div>
    </OperationDialog>
  )
}
