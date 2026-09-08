import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, LayoutGrid, Plus } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { BillEntryActions } from '@/components/finance/BillEntryActions'
import { ExpenseEntryActions } from '@/components/finance/ExpenseEntryActions'
import { PayBillDialog } from '@/components/finance/PayBillDialog'
import { PayExpenseDialog } from '@/components/finance/PayExpenseDialog'
import { OccurrenceMeta } from '@/components/forms/OccurrenceScopePicker'
import { EditEntryForm, type EditableEntry } from '@/components/ops/EditEntryForm'
import { EntryActionButtons } from '@/components/ops/EntryActionButtons'
import { OperationDialog } from '@/components/layout/OperationDialog'
import { PageHeader, PageHeaderDivider, PageHeaderIconButton } from '@/components/layout/PageHeader'
import { AddDayEntryForm, type AddDayEntryTab } from '@/components/planner/AddDayEntryForm'
import { PlannerDayItems } from '@/components/planner/PlannerDayItems'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchBills, fetchEvents, fetchExpenses, fetchIncome } from '@/lib/api'
import {
  dueSoonBadgeClass,
  formatDayLabel,
  isDueSoon,
  isPastDue,
  money,
  normalizeFinanceDate,
  paidBadgeClass,
  pastDueBadgeClass,
  typeBadgeClass,
} from '@/lib/financeUtils'
import { describeRecurrence } from '@/lib/recurrence'
import type { Bill, Expense, IncomeEntry, PlannerEvent } from '@/lib/types'
import { useAuthStore } from '@/stores/authStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

type PlannerViewProps = {
  mode: 'daily' | 'weekly' | 'monthly'
}

type PlannerIncomeItem = IncomeEntry & { kind: 'income'; date: string }
type PlannerBillItem = Bill & { kind: 'bill'; date: string }
type PlannerExpenseItem = Expense & { kind: 'expense'; date: string }
type PlannerScheduleItem = PlannerEvent | PlannerIncomeItem | PlannerBillItem | PlannerExpenseItem

const plannerMeta = {
  daily: { title: 'Daily planner', icon: CalendarDays },
  weekly: { title: 'Weekly planner', icon: CalendarRange },
  monthly: { title: 'Monthly planner', icon: LayoutGrid },
} as const

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function datesInPlannerRange(mode: PlannerViewProps['mode'], anchor: Date): string[] {
  if (mode === 'daily') {
    return [isoDate(anchor)]
  }
  if (mode === 'weekly') {
    const start = addDays(anchor, -anchor.getDay())
    return Array.from({ length: 7 }, (_, index) => isoDate(addDays(start, index)))
  }
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  const days: string[] = []
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(isoDate(cursor))
  }
  return days
}

function isInRange(iso: string, start: string, end: string) {
  const day = iso.slice(0, 10)
  return day >= start.slice(0, 10) && day <= end.slice(0, 10)
}

export function PlannerView({ mode }: PlannerViewProps) {
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
  const setOnUpdate = useRealtimeStore((s) => s.setOnUpdate)
  const [anchor, setAnchor] = useState(() => new Date())
  const [events, setEvents] = useState<PlannerEvent[]>([])
  const [income, setIncome] = useState<IncomeEntry[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [addDate, setAddDate] = useState(() => isoDate(new Date()))
  const [addTab, setAddTab] = useState<AddDayEntryTab>('event')
  const [payBill, setPayBill] = useState<Bill | null>(null)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payExpense, setPayExpense] = useState<Expense | null>(null)
  const [payExpenseDialogOpen, setPayExpenseDialogOpen] = useState(false)

  const range = useMemo(() => {
    if (mode === 'daily') {
      const day = isoDate(anchor)
      return { start: `${day}T00:00:00Z`, end: `${day}T23:59:59Z`, label: anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) }
    }
    if (mode === 'weekly') {
      const start = addDays(anchor, -anchor.getDay())
      const end = addDays(start, 6)
      return {
        start: `${isoDate(start)}T00:00:00Z`,
        end: `${isoDate(end)}T23:59:59Z`,
        label: `Week of ${start.toLocaleDateString()}`,
      }
    }
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    return {
      start: `${isoDate(start)}T00:00:00Z`,
      end: `${isoDate(end)}T23:59:59Z`,
      label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    }
  }, [anchor, mode])

  const plannerDays = useMemo(() => datesInPlannerRange(mode, anchor), [mode, anchor])
  const showDayItems = mode === 'daily' || mode === 'weekly'

  async function loadPlannerData() {
    if (!token || !workspaceId) return
    const id = Number(workspaceId)
    const [eventsData, incomeData, billsData, expensesData] = await Promise.all([
      fetchEvents(token, id, range.start, range.end),
      fetchIncome(token, id, range.start, range.end),
      fetchBills(token, id, range.start, range.end),
      fetchExpenses(token, id),
    ])
    setEvents(eventsData.events)
    setIncome(incomeData.income)
    setBills(billsData.bills)
    setExpenses(
      expensesData.expenses.filter((expense) =>
        isInRange(normalizeFinanceDate(expense.expense_date), range.start, range.end),
      ),
    )
    setReloadKey((key) => key + 1)
  }

  useEffect(() => {
    void loadPlannerData()
  }, [token, workspaceId, range.start, range.end])

  useEffect(() => {
    setOnUpdate(() => {
      void loadPlannerData()
    })
    return () => setOnUpdate(null)
  }, [token, workspaceId, range.start, range.end])

  const scheduleByDay = useMemo(() => {
    const map = new Map<string, PlannerScheduleItem[]>()

    const push = (day: string, item: PlannerScheduleItem) => {
      map.set(day, [...(map.get(day) ?? []), item])
    }

    for (const event of events) {
      push(event.start_at.slice(0, 10), event)
    }
    for (const item of income) {
      push(normalizeFinanceDate(item.entry_date), { ...item, kind: 'income', date: normalizeFinanceDate(item.entry_date) })
    }
    for (const item of bills) {
      push(normalizeFinanceDate(item.due_date), { ...item, kind: 'bill', date: normalizeFinanceDate(item.due_date) })
    }
    for (const item of expenses) {
      push(normalizeFinanceDate(item.expense_date), { ...item, kind: 'expense', date: normalizeFinanceDate(item.expense_date) })
    }

    return map
  }, [events, income, bills, expenses])

  const grouped = useMemo(() => {
    if (showDayItems) {
      return plannerDays.map((day) => [day, scheduleByDay.get(day) ?? []] as const)
    }
    return [...scheduleByDay.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [showDayItems, plannerDays, scheduleByDay])

  function closeDialog() {
    setDialogOpen(false)
    setEditEntry(null)
  }

  function startAdd(day: string, tab: AddDayEntryTab = 'event') {
    setAddDate(day)
    setAddTab(tab)
    setEditEntry(null)
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

  if (!token || !workspaceId) {
    return null
  }

  const planner = plannerMeta[mode]
  const step = mode === 'daily' ? 1 : mode === 'weekly' ? 7 : 30
  const workspaceNumericId = Number(workspaceId)

  return (
    <>
      <PageHeader
        icon={planner.icon}
        title={planner.title}
        subtitle={range.label}
      >
        <PageHeaderIconButton
          icon={ChevronLeft}
          label="Previous"
          onClick={() => setAnchor(addDays(anchor, -step))}
        />
        <PageHeaderIconButton
          icon={CalendarDays}
          label="Go to today"
          onClick={() => setAnchor(new Date())}
        />
        <PageHeaderIconButton
          icon={ChevronRight}
          label="Next"
          onClick={() => setAnchor(addDays(anchor, step))}
        />
        <PageHeaderDivider />
        <PageHeaderIconButton
          icon={Plus}
          label="Add entry"
          onClick={() => startAdd(isoDate(anchor))}
        />
      </PageHeader>

      <div className="space-y-6 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {grouped.length === 0 ? (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="py-10 text-center text-muted-foreground">
                Nothing scheduled in this range.
              </CardContent>
            </Card>
          ) : (
            grouped.map(([day, dayItems]) => (
              <Card key={day} className={mode === 'daily' ? 'md:col-span-2 xl:col-span-3' : undefined}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">
                    {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    title="Add entry"
                    aria-label="Add entry"
                    onClick={() => startAdd(day)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dayItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
                  ) : (
                    dayItems.map((item) => (
                      <PlannerScheduleRow
                        key={'occurrence_id' in item ? item.occurrence_id : `${item.kind}-${item.id}`}
                        item={item}
                        onEdit={startEdit}
                        onPay={startPay}
                        onPayExpense={startPayExpense}
                      />
                    ))
                  )}

                  {showDayItems ? (
                    <PlannerDayItems
                      token={token}
                      workspaceId={workspaceNumericId}
                      date={day}
                      reloadKey={reloadKey}
                    />
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <OperationDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditEntry(null)
        }}
        title={editEntry ? 'Edit entry' : 'Add entry'}
        description={editEntry ? 'Update or remove this item.' : `Add something for ${formatDayLabel(addDate)}.`}
      >
        {editEntry ? (
          <EditEntryForm
            key={`${editEntry.kind}-${editEntry.kind === 'expense' ? editEntry.data.id : editEntry.data.occurrence_id}`}
            token={token}
            workspaceId={workspaceNumericId}
            entry={editEntry}
            onSaved={() => {
              void loadPlannerData()
              closeDialog()
            }}
            onDeleted={() => {
              void loadPlannerData()
              closeDialog()
            }}
          />
        ) : (
          <AddDayEntryForm
            key={`${addDate}-${addTab}`}
            token={token}
            workspaceId={workspaceNumericId}
            defaultDate={addDate}
            defaultTab={addTab}
            onCreated={() => {
              void loadPlannerData()
              closeDialog()
            }}
          />
        )}
      </OperationDialog>

      <PayBillDialog
        open={payDialogOpen}
        onOpenChange={(open) => {
          setPayDialogOpen(open)
          if (!open) setPayBill(null)
        }}
        token={token}
        workspaceId={workspaceNumericId}
        bill={payBill}
        onComplete={() => void loadPlannerData()}
      />

      <PayExpenseDialog
        open={payExpenseDialogOpen}
        onOpenChange={(open) => {
          setPayExpenseDialogOpen(open)
          if (!open) setPayExpense(null)
        }}
        token={token}
        workspaceId={workspaceNumericId}
        expense={payExpense}
        onComplete={() => void loadPlannerData()}
      />
    </>
  )
}

function PlannerScheduleRow({
  item,
  onEdit,
  onPay,
  onPayExpense,
}: {
  item: PlannerScheduleItem
  onEdit: (entry: EditableEntry) => void
  onPay: (bill: Bill) => void
  onPayExpense: (expense: Expense) => void
}) {
  if (!('kind' in item)) {
    const event = item
    return (
      <div className="rounded-lg border p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-[#2563eb] text-white">Event</Badge>
              <p className="font-medium">{event.title}</p>
              {event.is_recurring ? <Badge className="bg-secondary text-secondary-foreground">Recurring</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {event.description ? (
              <p className="mt-2 text-sm text-muted-foreground">{event.description}</p>
            ) : null}
            <OccurrenceMeta
              isRecurring={event.is_recurring}
              recurrence={describeRecurrence(event.recurrence, event.start_at.slice(0, 10))}
            />
          </div>
          <EntryActionButtons onEdit={() => onEdit({ kind: 'event', data: event })} />
        </div>
      </div>
    )
  }

  if (item.kind === 'income') {
    return (
      <div className="rounded-lg border p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-[#15803d] text-white">Income</Badge>
              <p className="font-medium">{item.title}</p>
              {item.is_recurring ? <Badge className="bg-secondary text-secondary-foreground">Recurring</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {money(item.amount)} · {formatDayLabel(item.date)}
            </p>
            <OccurrenceMeta
              isRecurring={item.is_recurring}
              recurrence={describeRecurrence(item.recurrence, item.date)}
            />
          </div>
          <EntryActionButtons onEdit={() => onEdit({ kind: 'income', data: item })} />
        </div>
      </div>
    )
  }

  if (item.kind === 'bill') {
    const pastDue = !item.paid && !item.skipped && isPastDue(item.date)
    const dueSoon = !item.paid && !item.skipped && isDueSoon(item.date)

    return (
      <div className="rounded-lg border p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={typeBadgeClass}>Bill</Badge>
              <p className="font-medium">{item.title}</p>
              {pastDue ? <Badge className={pastDueBadgeClass}>Past due</Badge> : null}
              {dueSoon ? <Badge className={dueSoonBadgeClass}>Due soon</Badge> : null}
              {item.paid ? <Badge className={paidBadgeClass}>Paid</Badge> : null}
              {item.skipped ? <Badge className="bg-secondary text-secondary-foreground">Skipped</Badge> : null}
              {item.is_recurring ? <Badge className={typeBadgeClass}>Recurring</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {money(item.amount)} · due {formatDayLabel(item.date)}
            </p>
            <OccurrenceMeta
              isRecurring={item.is_recurring}
              recurrence={describeRecurrence(item.recurrence, item.date)}
            />
          </div>
          <BillEntryActions bill={item} onPay={() => onPay(item)} onEdit={() => onEdit({ kind: 'bill', data: item })} />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={typeBadgeClass}>Expense</Badge>
            <p className="font-medium">{item.title}</p>
            {item.paid ? <Badge className={paidBadgeClass}>Paid</Badge> : null}
            {item.skipped ? <Badge className="bg-secondary text-secondary-foreground">Skipped</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {money(item.amount)} · {formatDayLabel(item.date)}
          </p>
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
