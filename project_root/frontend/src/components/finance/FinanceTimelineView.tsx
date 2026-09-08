import { BillEntryActions } from '@/components/finance/BillEntryActions'
import { ExpenseEntryActions } from '@/components/finance/ExpenseEntryActions'
import { EntryActionButtons } from '@/components/ops/EntryActionButtons'
import type { EditableEntry } from '@/components/ops/EditEntryForm'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buildTimelineItems,
  formatDayLabel,
  money,
  paidBadgeClass,
  skippedBadgeClass,
  timelineDayClass,
  timelineDayTone,
  timelineDotClass,
  timelineShowPaidBadge,
  timelineShowDueSoonBadge,
  timelineShowPastDueBadge,
  timelineShowSkippedBadge,
  dueSoonBadgeClass,
  pastDueBadgeClass,
  timelineTypeLabel,
  typeBadgeClass,
} from '@/lib/financeUtils'
import { describeRecurrence } from '@/lib/recurrence'
import type { Bill, Expense, IncomeEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

type FinanceTimelineViewProps = {
  monthLabel: string
  monthStart: string
  monthEnd: string
  income: IncomeEntry[]
  bills: Bill[]
  expenses: Expense[]
  onEdit: (entry: EditableEntry) => void
  onPay: (bill: Bill) => void
  onPayExpense: (expense: Expense) => void
}

export function FinanceTimelineView({
  monthLabel,
  monthStart,
  monthEnd,
  income,
  bills,
  expenses,
  onEdit,
  onPay,
  onPayExpense,
}: FinanceTimelineViewProps) {
  const fromDate = monthStart.slice(0, 10)
  const toDate = monthEnd.slice(0, 10)
  const items = buildTimelineItems(income, bills, expenses, fromDate, toDate)

  const grouped = items.reduce<Map<string, typeof items>>((map, item) => {
    map.set(item.date, [...(map.get(item.date) ?? []), item])
    return map
  }, new Map())

  const incomeTotal = items.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amount, 0)
  const billsTotal = items
    .filter((item) => item.kind === 'bill' && !item.paid && !item.skipped)
    .reduce((sum, item) => sum + item.amount, 0)
  const expenseTotal = items
    .filter((item) => item.kind === 'expense' && !item.paid && !item.skipped)
    .reduce((sum, item) => sum + item.amount, 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Month</CardTitle></CardHeader><CardContent className="font-semibold">{monthLabel}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Income</CardTitle></CardHeader><CardContent className="font-semibold text-[#15803d]">{money(incomeTotal)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Unpaid bills</CardTitle></CardHeader><CardContent className="font-semibold text-[#dc2626]">{money(billsTotal)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Unpaid expenses</CardTitle></CardHeader><CardContent className="font-semibold">{money(expenseTotal)}</CardContent></Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Timeline</CardTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-[#dc2626]/25 bg-[#dc2626]/8" />
              Past due
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-[#ca8a04]/30 bg-[#ca8a04]/10" />
              Due within 14 days
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-[#15803d]/20 bg-[#15803d]/8" />
              Due later / income
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-border/70 bg-muted/25" />
              Settled
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-border/50 bg-muted/10" />
              Skipped
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {grouped.size === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled or recorded this month.</p>
          ) : (
            <div className="space-y-4">
              {[...grouped.entries()].map(([date, dayItems], index, entries) => {
                const dayTone = timelineDayTone(dayItems)
                const isLast = index === entries.length - 1

                return (
                  <div key={date} className={cn('rounded-xl border p-4', timelineDayClass(dayItems))}>
                    <div className="grid gap-4 md:grid-cols-[140px_1fr]">
                      <div className="relative md:pt-1">
                        <div
                          className={cn(
                            'absolute left-[6px] top-8 hidden w-0.5 rounded-full bg-muted-foreground/45 md:block',
                            isLast ? 'bottom-0' : 'h-[calc(100%+1rem)]',
                          )}
                        />
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'relative z-[1] hidden h-3.5 w-3.5 shrink-0 rounded-full border-4 border-background md:block',
                              timelineDotClass(dayTone),
                            )}
                          />
                          <div>
                            <p className="font-medium">{formatDayLabel(date)}</p>
                            <p className="text-xs text-muted-foreground">{date}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {dayItems.map((item) => {
                          const signedAmount = item.kind === 'income' ? `+${money(item.amount)}` : `-${money(item.amount)}`
                          const isSettledOrInactive =
                            (item.kind === 'bill' || item.kind === 'expense') && (item.paid || item.skipped)

                          return (
                            <div
                              key={`${item.kind}-${item.kind === 'expense' ? item.data.id : item.data.occurrence_id}`}
                              className="rounded-lg border border-border/60 bg-background/80 p-3 backdrop-blur-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge className={typeBadgeClass}>{timelineTypeLabel(item)}</Badge>
                                    <p className="font-medium">{item.title}</p>
                                    {timelineShowPastDueBadge(item) ? (
                                      <Badge className={pastDueBadgeClass}>Past due</Badge>
                                    ) : null}
                                    {timelineShowDueSoonBadge(item) ? (
                                      <Badge className={dueSoonBadgeClass}>Due soon</Badge>
                                    ) : null}
                                    {timelineShowPaidBadge(item) ? (
                                      <Badge className={paidBadgeClass}>Paid</Badge>
                                    ) : null}
                                    {timelineShowSkippedBadge(item) ? (
                                      <Badge className={skippedBadgeClass}>Skipped</Badge>
                                    ) : null}
                                    {item.kind !== 'expense' && item.data.is_recurring ? (
                                      <Badge className={typeBadgeClass}>Recurring</Badge>
                                    ) : null}
                                  </div>
                                  <p className={cn('text-sm font-medium', isSettledOrInactive ? 'text-muted-foreground' : 'text-foreground')}>
                                    {signedAmount}
                                  </p>
                                  {item.kind === 'income' && item.data.is_recurring ? (
                                    <p className="text-xs text-muted-foreground">
                                      {describeRecurrence(item.data.recurrence, item.date)}
                                    </p>
                                  ) : null}
                                  {item.kind === 'bill' && item.data.is_recurring ? (
                                    <p className="text-xs text-muted-foreground">
                                      {describeRecurrence(item.data.recurrence, item.date)}
                                    </p>
                                  ) : null}
                                </div>
                                {item.kind === 'bill' ? (
                                  <BillEntryActions
                                    bill={item.data}
                                    onPay={() => onPay(item.data)}
                                    onEdit={() => onEdit({ kind: 'bill', data: item.data })}
                                  />
                                ) : item.kind === 'expense' ? (
                                  <ExpenseEntryActions
                                    expense={item.data}
                                    onPay={() => onPayExpense(item.data)}
                                    onEdit={() => onEdit({ kind: 'expense', data: item.data })}
                                  />
                                ) : (
                                  <EntryActionButtons
                                    onEdit={() => onEdit({ kind: 'income', data: item.data })}
                                  />
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
