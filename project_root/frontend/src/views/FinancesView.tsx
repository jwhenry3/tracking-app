import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Plus, Wallet } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { FinanceAnalyticsView } from '@/components/finance/FinanceAnalyticsView'
import { FinanceTimelineView } from '@/components/finance/FinanceTimelineView'
import { PayBillDialog } from '@/components/finance/PayBillDialog'
import { PayExpenseDialog } from '@/components/finance/PayExpenseDialog'
import { UntilNextIncomeView } from '@/components/finance/UntilNextIncomeView'
import { FormField } from '@/components/forms/FormField'
import { defaultRecurrenceConfig, RecurrencePicker } from '@/components/forms/RecurrencePicker'
import { OperationDialog, OpsTabs } from '@/components/layout/OperationDialog'
import { PageHeader, PageHeaderIconButton } from '@/components/layout/PageHeader'
import { EditEntryForm, type EditableEntry } from '@/components/ops/EditEntryForm'
import { Button } from '@/components/ui/button'
import {
  createBill,
  createExpense,
  createIncome,
  fetchBills,
  fetchExpenses,
  fetchFinanceSummary,
  fetchIncome,
} from '@/lib/api'
import { extendedFinanceRange, monthRange } from '@/lib/financeUtils'
import { buildRecurrenceRule } from '@/lib/recurrence'
import type { Bill, Expense, FinanceSummary, IncomeEntry } from '@/lib/types'

import { useAuthStore } from '@/stores/authStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

type FinanceFormTab = 'income' | 'bill' | 'expense'
type FinancePageView = 'runway' | 'timeline' | 'analytics'

export function FinancesView({ view: pageView }: { view: FinancePageView }) {
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
  const setOnUpdate = useRealtimeStore((s) => s.setOnUpdate)
  const currentMonth = useMemo(() => monthRange(), [])
  const extendedRange = useMemo(() => extendedFinanceRange(), [])

  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [income, setIncome] = useState<IncomeEntry[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
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

  async function loadAll() {
    if (!token || !workspaceId) return
    const id = Number(workspaceId)
    const [summaryData, incomeData, billsData, expensesData] = await Promise.all([
      fetchFinanceSummary(token, id, currentMonth.start, currentMonth.end),
      fetchIncome(token, id, extendedRange.start, extendedRange.end),
      fetchBills(token, id, extendedRange.start, extendedRange.end),
      fetchExpenses(token, id),
    ])
    setSummary(summaryData)
    setIncome(incomeData.income)
    setBills(billsData.bills)
    setExpenses(expensesData.expenses)
  }

  useEffect(() => {
    void loadAll()
  }, [token, workspaceId])

  useEffect(() => {
    setOnUpdate(() => {
      void loadAll()
    })
    return () => setOnUpdate(null)
  }, [token, workspaceId])

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
    await loadAll()
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
    await loadAll()
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
    await loadAll()
    closeDialog()
  }

  if (!token || !workspaceId) {
    return null
  }

  return (
    <>
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <PageHeader
          icon={Wallet}
          title="Finances"
          subtitle="Plan between paychecks, review the month, and track trends"
        >
          <PageHeaderIconButton icon={Plus} label="Add entry" onClick={() => startAdd('income')} />
        </PageHeader>
      </div>

      <div className="space-y-6 p-4">
        {pageView === 'runway' ? (
          <UntilNextIncomeView
            income={income}
            bills={bills}
            expenses={expenses}
            onEdit={startEdit}
            onPay={startPay}
            onPayExpense={startPayExpense}
          />
        ) : null}

        {pageView === 'timeline' ? (
          <FinanceTimelineView
            monthLabel={currentMonth.label}
            monthStart={currentMonth.start}
            monthEnd={currentMonth.end}
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
              void loadAll()
              closeDialog()
            }}
            onDeleted={() => {
              void loadAll()
              closeDialog()
            }}
          />
        ) : (
          <>
            <OpsTabs
              tabs={[
                { id: 'income', label: 'Income' },
                { id: 'bill', label: 'Bill' },
                { id: 'expense', label: 'Expense' },
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
        onComplete={() => void loadAll()}
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
        onComplete={() => void loadAll()}
      />
    </>
  )
}
