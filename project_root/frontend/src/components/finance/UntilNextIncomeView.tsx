import { EntryActionButtons } from '@/components/ops/EntryActionButtons'
import { BillEntryActions } from '@/components/finance/BillEntryActions'
import { ExpenseEntryActions } from '@/components/finance/ExpenseEntryActions'
import type { EditableEntry } from '@/components/ops/EditEntryForm'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buildRunwaySnapshot,
  dueSoonBadgeClass,
  formatDayLabel,
  isDueSoonBill,
  isDueSoonExpense,
  isPastDueBill,
  isPastDueExpense,
  money,
  normalizeFinanceDate,
  pastDueBadgeClass,
  typeBadgeClass,
} from '@/lib/financeUtils'
import { describeRecurrence } from '@/lib/recurrence'
import type { Bill, Expense, IncomeEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

type UntilNextIncomeViewProps = {
  income: IncomeEntry[]
  bills: Bill[]
  expenses: Expense[]
  onEdit: (entry: EditableEntry) => void
  onPay: (bill: Bill) => void
  onPayExpense: (expense: Expense) => void
}

type RunwayListItem = {
  id: string
  sortDate: string
  typeLabel: 'Bill' | 'Expense'
  title: string
  meta: string
  badge?: string
  pastDue?: boolean
  dueSoon?: boolean
  bill?: Bill
  expense?: Expense
  onEdit: () => void
  onPay?: () => void
  onPayExpense?: () => void
}

export function UntilNextIncomeView({ income, bills, expenses, onEdit, onPay, onPayExpense }: UntilNextIncomeViewProps) {
  const snapshot = buildRunwaySnapshot(income, bills, expenses)

  const runwayItems: RunwayListItem[] = [
    ...snapshot.bills.map((bill) => ({
      id: bill.occurrence_id,
      sortDate: normalizeFinanceDate(bill.due_date),
      typeLabel: 'Bill' as const,
      title: bill.title,
      meta: `${money(bill.amount)} · ${formatDayLabel(bill.due_date)}`,
      badge: bill.is_recurring ? 'Recurring' : undefined,
      pastDue: isPastDueBill(bill),
      dueSoon: isDueSoonBill(bill),
      bill,
      onEdit: () => onEdit({ kind: 'bill', data: bill }),
      onPay: () => onPay(bill),
    })),
    ...snapshot.expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      sortDate: normalizeFinanceDate(expense.expense_date),
      typeLabel: 'Expense' as const,
      title: expense.title,
      meta: `${money(expense.amount)} · ${formatDayLabel(expense.expense_date)}`,
      pastDue: isPastDueExpense(expense),
      dueSoon: isDueSoonExpense(expense),
      expense,
      onEdit: () => onEdit({ kind: 'expense', data: expense }),
      onPayExpense: () => onPayExpense(expense),
    })),
  ].sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title))

  return (
    <div className="space-y-6">
      <Card className="border-[#15803d]/30 bg-[#15803d]/5">
        <CardHeader>
          <CardTitle>Next income</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {snapshot.nextIncome ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-2xl font-semibold">{snapshot.nextIncome.title}</p>
                  <p className="text-sm text-muted-foreground">
                    Expected on {formatDayLabel(snapshot.nextIncome.entry_date)}
                  </p>
                  {snapshot.nextIncome.is_recurring ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {describeRecurrence(snapshot.nextIncome.recurrence, snapshot.nextIncome.entry_date)}
                    </p>
                  ) : null}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-3xl font-semibold text-[#15803d]">{money(snapshot.nextIncome.amount)}</p>
                  <EntryActionButtons onEdit={() => onEdit({ kind: 'income', data: snapshot.nextIncome! })} />
                </div>
              </div>
              {snapshot.lastIncome ? (
                <p className="text-sm text-muted-foreground">
                  Last income: {snapshot.lastIncome.title} ({money(snapshot.lastIncome.amount)} on {formatDayLabel(snapshot.lastIncome.entry_date)})
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No upcoming income is scheduled. Add income with a future date to see your runway.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryTile label="Unpaid bills until then" value={money(snapshot.billsTotal)} tone="danger" />
        <SummaryTile label="Unpaid expenses until then" value={money(snapshot.expensesTotal)} tone="neutral" />
        <SummaryTile
          label="Projected remaining"
          value={snapshot.projectedRemaining == null ? '—' : money(snapshot.projectedRemaining)}
          tone={snapshot.projectedRemaining != null && snapshot.projectedRemaining < 0 ? 'danger' : 'positive'}
        />
      </div>

      <RunwayListCard
        title="Due before next income"
        emptyMessage={
          snapshot.nextIncome
            ? 'No unpaid bills or expenses before your next income.'
            : 'No unpaid bills or expenses in the current window.'
        }
        items={runwayItems}
      />
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'positive' | 'danger' | 'neutral'
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            'text-2xl font-semibold',
            tone === 'positive' && 'text-[#15803d]',
            tone === 'danger' && 'text-[#dc2626]',
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function RunwayListCard({
  title,
  emptyMessage,
  items,
}: {
  title: string
  emptyMessage: string
  items: RunwayListItem[]
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={typeBadgeClass}>{item.typeLabel}</Badge>
                  <p className="font-medium">{item.title}</p>
                  {item.pastDue ? <Badge className={pastDueBadgeClass}>Past due</Badge> : null}
                  {item.dueSoon ? <Badge className={dueSoonBadgeClass}>Due soon</Badge> : null}
                  {item.badge ? <Badge className={typeBadgeClass}>{item.badge}</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">{item.meta}</p>
              </div>
              {item.bill && item.onPay ? (
                <BillEntryActions bill={item.bill} onPay={item.onPay} onEdit={item.onEdit} />
              ) : item.expense && item.onPayExpense ? (
                <ExpenseEntryActions expense={item.expense} onPay={item.onPayExpense} onEdit={item.onEdit} />
              ) : (
                <EntryActionButtons onEdit={item.onEdit} />
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
