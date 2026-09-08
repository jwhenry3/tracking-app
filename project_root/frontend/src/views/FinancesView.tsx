import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Wallet } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { FinanceAnalyticsView } from '@/components/finance/FinanceAnalyticsView'
import { FinanceTimelineView } from '@/components/finance/FinanceTimelineView'
import { PayBillDialog } from '@/components/finance/PayBillDialog'
import { PayExpenseDialog } from '@/components/finance/PayExpenseDialog'
import { FormField } from '@/components/forms/FormField'
import { defaultRecurrenceConfig, RecurrencePicker } from '@/components/forms/RecurrencePicker'
import { OperationDialog, OpsTabs } from '@/components/layout/OperationDialog'
import {
  PageHeader,
  PageHeaderDivider,
  PageHeaderIconButton,
  PageHeaderTextButton,
} from '@/components/layout/PageHeader'
import { EditEntryForm, type EditableEntry } from '@/components/ops/EditEntryForm'
import { entryTypeMeta } from '@/components/ops/EntryTypeIcon'
import { Button } from '@/components/ui/button'
import {
  createBill,
  createExpense,
  createIncome,
} from '@/lib/api'
import { extendedFinanceRange, monthRange } from '@/lib/financeUtils'
import { invalidatePlannerFinance } from '@/lib/queries/invalidate'
import {
  useBillsQuery,
  useExpensesQuery,
  useFinanceSummaryQuery,
  useIncomeQuery,
} from '@/lib/queries/hooks'
import { buildRecurrenceRule } from '@/lib/recurrence'
import type { Bill, Expense } from '@/lib/types'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'
import { useAuthStore } from '@/stores/authStore'

type FinanceFormTab = 'income' | 'bill' | 'expense'
type FinancePageView = 'timeline' | 'analytics'

export function FinancesView({ view: pageView }: { view: FinancePageView }) {
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
  const { canManageFinances } = useWorkspacePermissions()
  const queryClient = useQueryClient()
  const workspaceNumericId = workspaceId ? Number(workspaceId) : null
  const queriesEnabled = Boolean(token && workspaceNumericId)
  const [financeMonth, setFinanceMonth] = useState(() => new Date())

  const monthWindow = useMemo(() => monthRange(financeMonth), [financeMonth])
  const extendedRange = useMemo(() => extendedFinanceRange(5, 0, financeMonth), [financeMonth])

  const summaryQuery = useFinanceSummaryQuery(
    workspaceNumericId,
    monthWindow.start,
    monthWindow.end,
    queriesEnabled && pageView === 'analytics',
  )
  const incomeQuery = useIncomeQuery(
    workspaceNumericId,
    extendedRange.start,
    extendedRange.end,
    queriesEnabled,
  )
  const billsQuery = useBillsQuery(
    workspaceNumericId,
    extendedRange.start,
    extendedRange.end,
    queriesEnabled,
  )
  const expensesQuery = useExpensesQuery(workspaceNumericId, queriesEnabled)

  const summary = summaryQuery.data ?? null
  const income = incomeQuery.data ?? []
  const bills = billsQuery.data ?? []
  const expenses = expensesQuery.data ?? []

  function refreshFinance() {
    if (!workspaceNumericId) return
    void invalidatePlannerFinance(queryClient, workspaceNumericId)
    void queryClient.invalidateQueries({
      queryKey: ['finance-summary', workspaceNumericId],
    })
  }
  const [formTab, setFormTab] = useState<FinanceFormTab>('income')
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [payBill, setPayBill] = useState<Bill | null>(null)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payExpense, setPayExpense] = useState<Expense | null>(null)
  const [payExpenseDialogOpen, setPayExpenseDialogOpen] = useState(false)

  const [incomeForm, setIncomeForm] = useState({
    title: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    recurrence: defaultRecurrenceConfig,
  })
  const [billForm, setBillForm] = useState({
    title: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    category: 'utilities',
    recurrence: defaultRecurrenceConfig,
  })
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    category: 'general',
  })

  function closeDialog() {
    setDialogOpen(false)
    setEditEntry(null)
  }

  function startAdd(tab: FinanceFormTab = 'income') {
    setEditEntry(null)
    setFormTab(tab)
    setDialogOpen(true)
  }

  function startEdit(entry: EditableEntry) {
    setEditEntry(entry)
    setDialogOpen(true)
  }

  function startPay(bill: Bill) {
    setPayBill(bill)
    setPayDialogOpen(true)
  }

  function startPayExpense(expense: Expense) {
    setPayExpense(expense)
    setPayExpenseDialogOpen(true)
  }

  async function submitIncome(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspaceId) return
    await createIncome(token, Number(workspaceId), {
      title: incomeForm.title,
      amount: Number(incomeForm.amount),
      date: incomeForm.date,
      recurrence: buildRecurrenceRule(incomeForm.recurrence, incomeForm.date),
    })
    setIncomeForm({ title: '', amount: '', date: incomeForm.date, recurrence: defaultRecurrenceConfig })
    await refreshFinance()
    closeDialog()
  }

  async function submitBill(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspaceId) return
    await createBill(token, Number(workspaceId), {
      title: billForm.title,
      amount: Number(billForm.amount),
      date: billForm.date,
      category: billForm.category,
      recurrence: buildRecurrenceRule(billForm.recurrence, billForm.date),
    })
    setBillForm({
      title: '',
      amount: '',
      date: billForm.date,
      category: billForm.category,
      recurrence: defaultRecurrenceConfig,
    })
    await refreshFinance()
    closeDialog()
  }

  async function submitExpense(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspaceId) return
    await createExpense(token, Number(workspaceId), {
      title: expenseForm.title,
      amount: Number(expenseForm.amount),
      date: expenseForm.date,
      category: expenseForm.category,
    })
    setExpenseForm({ title: '', amount: '', date: expenseForm.date, category: expenseForm.category })
    await refreshFinance()
    closeDialog()
  }

  if (!token || !workspaceId) {
    return null
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <PageHeader
          icon={Wallet}
          title="Finances"
          subtitle={monthWindow.label}
        >
          <PageHeaderIconButton
            icon={ChevronLeft}
            label="Previous month"
            onClick={() =>
              setFinanceMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
            }
          />
          <PageHeaderTextButton label="Today" onClick={() => setFinanceMonth(new Date())} />
          <PageHeaderIconButton
            icon={ChevronRight}
            label="Next month"
            onClick={() =>
              setFinanceMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
            }
          />
          <PageHeaderDivider />
          {canManageFinances ? (
          <PageHeaderIconButton icon={Plus} label="Add entry" onClick={() => startAdd('income')} />
          ) : null}
        </PageHeader>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto space-y-4 p-3 md:space-y-6 md:p-4">
        {pageView === 'timeline' ? (
          <FinanceTimelineView
            monthLabel={monthWindow.label}
            monthStart={monthWindow.start}
            monthEnd={monthWindow.end}
            income={income}
            bills={bills}
            expenses={expenses}
            onEdit={startEdit}
            onPay={startPay}
            onPayExpense={startPayExpense}
          />
        ) : null}

        {pageView === 'analytics' ? (
          <FinanceAnalyticsView
            monthLabel={monthWindow.label}
            monthDate={financeMonth}
            summary={summary}
            income={income}
            bills={bills}
            expenses={expenses}
          />
        ) : null}
      </div>

      <OperationDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditEntry(null)
        }}
        title={editEntry ? 'Edit entry' : 'Add entry'}
        description={editEntry ? 'Update or remove this item.' : 'Record income, bills, or expenses.'}
      >
        {editEntry ? (
          <EditEntryForm
            key={`${editEntry.kind}-${editEntry.kind === 'expense' ? editEntry.data.id : editEntry.data.occurrence_id}`}
            token={token}
            workspaceId={Number(workspaceId)}
            entry={editEntry}
            onSaved={() => {
              refreshFinance()
              closeDialog()
            }}
            onDeleted={() => {
              refreshFinance()
              closeDialog()
            }}
          />
        ) : (
          <>
            <OpsTabs
              tabs={[
                { id: 'income', label: 'Income', icon: entryTypeMeta.income.icon, iconClassName: entryTypeMeta.income.className },
                { id: 'bill', label: 'Bill', icon: entryTypeMeta.bill.icon, iconClassName: entryTypeMeta.bill.className },
                { id: 'expense', label: 'Expense', icon: entryTypeMeta.expense.icon, iconClassName: entryTypeMeta.expense.className },
              ]}
              activeTab={formTab}
              onChange={(tabId) => setFormTab(tabId as FinanceFormTab)}
            />

            {formTab === 'income' ? (
              <form className="space-y-4" onSubmit={(event) => void submitIncome(event)}>
                <FormField label="Title" value={incomeForm.title} onChange={(value) => setIncomeForm((s) => ({ ...s, title: value }))} />
                <FormField label="Amount" type="number" value={incomeForm.amount} onChange={(value) => setIncomeForm((s) => ({ ...s, amount: value }))} />
                <FormField label="Date" type="date" value={incomeForm.date} onChange={(value) => setIncomeForm((s) => ({ ...s, date: value }))} />
                <RecurrencePicker value={incomeForm.recurrence} anchorDate={incomeForm.date} onChange={(value) => setIncomeForm((s) => ({ ...s, recurrence: value }))} />
                <Button type="submit" className="w-full">Save income</Button>
              </form>
            ) : null}

            {formTab === 'bill' ? (
              <form className="space-y-4" onSubmit={(event) => void submitBill(event)}>
                <FormField label="Title" value={billForm.title} onChange={(value) => setBillForm((s) => ({ ...s, title: value }))} />
                <FormField label="Amount" type="number" value={billForm.amount} onChange={(value) => setBillForm((s) => ({ ...s, amount: value }))} />
                <FormField label="Due date" type="date" value={billForm.date} onChange={(value) => setBillForm((s) => ({ ...s, date: value }))} />
                <RecurrencePicker value={billForm.recurrence} anchorDate={billForm.date} onChange={(value) => setBillForm((s) => ({ ...s, recurrence: value }))} />
                <Button type="submit" className="w-full">Save bill</Button>
              </form>
            ) : null}

            {formTab === 'expense' ? (
              <form className="space-y-4" onSubmit={(event) => void submitExpense(event)}>
                <FormField label="Title" value={expenseForm.title} onChange={(value) => setExpenseForm((s) => ({ ...s, title: value }))} />
                <FormField label="Amount" type="number" value={expenseForm.amount} onChange={(value) => setExpenseForm((s) => ({ ...s, amount: value }))} />
                <FormField label="Date" type="date" value={expenseForm.date} onChange={(value) => setExpenseForm((s) => ({ ...s, date: value }))} />
                <Button type="submit" className="w-full">Save expense</Button>
              </form>
            ) : null}
          </>
        )}
      </OperationDialog>

      <PayBillDialog
        open={payDialogOpen}
        onOpenChange={(open) => {
          setPayDialogOpen(open)
          if (!open) setPayBill(null)
        }}
        token={token}
        workspaceId={Number(workspaceId)}
        bill={payBill}
        onComplete={() => refreshFinance()}
      />

      <PayExpenseDialog
        open={payExpenseDialogOpen}
        onOpenChange={(open) => {
          setPayExpenseDialogOpen(open)
          if (!open) setPayExpense(null)
        }}
        token={token}
        workspaceId={Number(workspaceId)}
        expense={payExpense}
        onComplete={() => refreshFinance()}
      />
    </div>
  )
}
