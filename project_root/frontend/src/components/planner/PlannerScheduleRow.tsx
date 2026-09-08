import { BillEntryActions } from '@/components/finance/BillEntryActions'
import { ExpenseEntryActions } from '@/components/finance/ExpenseEntryActions'
import { EntryActionButtons } from '@/components/ops/EntryActionButtons'
import { EntryTypeIcon } from '@/components/ops/EntryTypeIcon'
import type { EditableEntry } from '@/components/ops/EditEntryForm'
import { Badge } from '@/components/ui/badge'
import {
  dueSoonBadgeClass,
  isDueSoon,
  isPastDue,
  pastDueBadgeClass,
  signedMoney,
  signedMoneyTextClass,
} from '@/lib/financeUtils'
import type { Bill, Expense, IncomeEntry, PlannerEvent } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ManageActions } from '@/lib/workspacePermissions'

export type PlannerIncomeItem = IncomeEntry & { kind: 'income'; date: string }
export type PlannerBillItem = Bill & { kind: 'bill'; date: string }
export type PlannerExpenseItem = Expense & { kind: 'expense'; date: string }
export type PlannerScheduleItem = PlannerEvent | PlannerIncomeItem | PlannerBillItem | PlannerExpenseItem

type PlannerScheduleRowProps = {
  item: PlannerScheduleItem
  onEdit: (entry: EditableEntry) => void
  onPay: (bill: Bill) => void
  onPayExpense: (expense: Expense) => void
}

export function PlannerScheduleRow({ item, onEdit, onPay, onPayExpense }: PlannerScheduleRowProps) {
  if (!('kind' in item)) {
    const event = item
    return (
      <div className="space-y-0.5 py-0.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <EntryTypeIcon kind="event" variant="badge" />
            <p className="min-w-0 truncate font-medium">{event.title}</p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <ManageActions area="planning">
            <EntryActionButtons onEdit={() => onEdit({ kind: 'event', data: event })} />
          </ManageActions>
        </div>
        {event.description ? (
          <p className="text-xs text-muted-foreground">{event.description}</p>
        ) : null}
      </div>
    )
  }

  if (item.kind === 'income') {
    return (
      <div className="py-0.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <EntryTypeIcon kind="income" variant="badge" />
            <p className="min-w-0 truncate font-medium">{item.title}</p>
            <span className={cn('shrink-0 text-xs', signedMoneyTextClass('income'))}>{signedMoney('income', item.amount)}</span>
          </div>
          <ManageActions area="finances">
            <EntryActionButtons onEdit={() => onEdit({ kind: 'income', data: item })} />
          </ManageActions>
        </div>
      </div>
    )
  }

  if (item.kind === 'bill') {
    const pastDue = !item.paid && !item.skipped && isPastDue(item.date)
    const dueSoon = !item.paid && !item.skipped && isDueSoon(item.date)

    return (
      <div className="py-0.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <EntryTypeIcon kind="bill" variant="badge" />
            <p className="min-w-0 truncate font-medium">{item.title}</p>
            <span className={cn('shrink-0 text-xs', signedMoneyTextClass('bill'))}>{signedMoney('bill', item.amount)}</span>
            {pastDue ? <Badge className={`text-xs ${pastDueBadgeClass}`}>Past due</Badge> : null}
            {dueSoon ? <Badge className={`text-xs ${dueSoonBadgeClass}`}>Due soon</Badge> : null}
            {item.skipped ? <Badge className="bg-secondary text-xs text-secondary-foreground">Skipped</Badge> : null}
          </div>
          <BillEntryActions bill={item} onPay={() => onPay(item)} onEdit={() => onEdit({ kind: 'bill', data: item })} />
        </div>
      </div>
    )
  }

  return (
    <div className="py-0.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <EntryTypeIcon kind="expense" variant="badge" />
          <p className="min-w-0 truncate font-medium">{item.title}</p>
          <span className={cn('shrink-0 text-xs', signedMoneyTextClass('expense'))}>{signedMoney('expense', item.amount)}</span>
          {item.skipped ? <Badge className="bg-secondary text-xs text-secondary-foreground">Skipped</Badge> : null}
        </div>
        <ExpenseEntryActions
          expense={item}
          onPay={() => onPayExpense(item)}
          onEdit={() => onEdit({ kind: 'expense', data: item })}
        />
      </div>
    </div>
  )
}
