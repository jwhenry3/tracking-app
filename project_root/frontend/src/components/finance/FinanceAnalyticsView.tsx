import { FinanceBarChart, FinanceGroupedBarChart, FinanceLineChart } from '@/components/finance/FinanceBarChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buildMonthlyTotals,
  expenseCategoryTotals,
  monthKey,
  money,
  recentMonthKeys,
} from '@/lib/financeUtils'
import type { Bill, Expense, FinanceSummary, IncomeEntry } from '@/lib/types'

type FinanceAnalyticsViewProps = {
  monthLabel: string
  monthDate: Date
  summary: FinanceSummary | null
  income: IncomeEntry[]
  bills: Bill[]
  expenses: Expense[]
}

const chartColors = {
  income: '#15803d',
  bills: '#dc2626',
  expenses: '#64748b',
  net: '#2563eb',
} as const

export function FinanceAnalyticsView({
  monthLabel,
  monthDate,
  summary,
  income,
  bills,
  expenses,
}: FinanceAnalyticsViewProps) {
  const monthKeys = recentMonthKeys(6, monthDate)
  const selectedMonthKey = monthKey(monthDate.toISOString().slice(0, 10))
  const monthlyTotals = buildMonthlyTotals(income, bills, expenses, monthKeys)
  const categories = monthlyTotals.map((month) => ({ key: month.key, label: month.label }))
  const monthExpenses = expenses.filter(
    (item) => !item.skipped && monthKey(item.expense_date) === selectedMonthKey,
  )
  const categoryTotals = expenseCategoryTotals(monthExpenses)

  const latestMonth = monthlyTotals[monthlyTotals.length - 1]
  const averageNet = monthlyTotals.reduce((sum, month) => sum + month.net, 0) / Math.max(monthlyTotals.length, 1)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle>Income · {monthLabel}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{money(summary?.income_total ?? 0)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Bills · {monthLabel}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{money(summary?.bills_due ?? 0)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Expenses · {monthLabel}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{money(summary?.expense_total ?? 0)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Net · {monthLabel}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{money(summary?.net ?? 0)}</CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Selected month net</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{money(latestMonth?.net ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">6-month average net</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{money(averageNet)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expenses · {monthLabel}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">
            {money(monthExpenses.reduce((sum, item) => sum + item.amount, 0))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <FinanceGroupedBarChart
              title="Monthly cash flow"
              categories={categories}
              groups={[
                {
                  key: 'income',
                  label: 'Income',
                  color: chartColors.income,
                  values: Object.fromEntries(monthlyTotals.map((month) => [month.key, month.income])),
                },
                {
                  key: 'bills',
                  label: 'Bills',
                  color: chartColors.bills,
                  values: Object.fromEntries(monthlyTotals.map((month) => [month.key, month.bills])),
                },
                {
                  key: 'expenses',
                  label: 'Expenses',
                  color: chartColors.expenses,
                  values: Object.fromEntries(monthlyTotals.map((month) => [month.key, month.expenses])),
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <FinanceLineChart
              title="Net trend"
              color={chartColors.net}
              points={monthlyTotals.map((month) => ({
                key: month.key,
                label: month.label,
                value: month.net,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <FinanceBarChart
              title="Average monthly breakdown"
              series={[
                {
                  key: 'income',
                  label: 'Income',
                  value: monthlyTotals.reduce((sum, month) => sum + month.income, 0) / monthlyTotals.length,
                  color: chartColors.income,
                },
                {
                  key: 'bills',
                  label: 'Bills',
                  value: monthlyTotals.reduce((sum, month) => sum + month.bills, 0) / monthlyTotals.length,
                  color: chartColors.bills,
                },
                {
                  key: 'expenses',
                  label: 'Expenses',
                  value: monthlyTotals.reduce((sum, month) => sum + month.expenses, 0) / monthlyTotals.length,
                  color: chartColors.expenses,
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expense categories · {monthLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryTotals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
            ) : (
              <FinanceBarChart
                title="Spending by category"
                series={categoryTotals.map((item) => ({
                  key: item.category,
                  label: item.category,
                  value: item.total,
                  color: chartColors.expenses,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
