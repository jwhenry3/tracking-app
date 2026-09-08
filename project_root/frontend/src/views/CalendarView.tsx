import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks, Plus, X } from 'lucide-react'
import { useLocation, useParams } from 'react-router-dom'

import { CalendarMonthCard } from '@/components/calendar/CalendarMonthCard'
import { AddDayEntryForm, type AddDayEntryTab } from '@/components/planner/AddDayEntryForm'
import { EditEntryForm, type EditableEntry } from '@/components/ops/EditEntryForm'
import { EntryActionButtons } from '@/components/ops/EntryActionButtons'
import { EntryTypeIcon } from '@/components/ops/EntryTypeIcon'
import { BillEntryActions } from '@/components/finance/BillEntryActions'
import { ExpenseEntryActions } from '@/components/finance/ExpenseEntryActions'
import { PayBillDialog } from '@/components/finance/PayBillDialog'
import { PayExpenseDialog } from '@/components/finance/PayExpenseDialog'
import { OccurrenceMeta } from '@/components/forms/OccurrenceScopePicker'
import { OperationDialog } from '@/components/layout/OperationDialog'
import { PageHeader, PageHeaderDivider, PageHeaderIconButton, PageHeaderTextButton } from '@/components/layout/PageHeader'
import { PlannerDayPanel } from '@/components/planner/PlannerDayPanel'
import type { PlannerScheduleItem } from '@/components/planner/PlannerScheduleRow'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  dueSoonBadgeClass,
  formatDayLabel,
  isDueSoon,
  isPastDue,
  normalizeFinanceDate,
  paidBadgeClass,
  pastDueBadgeClass,
  skippedBadgeClass,
  typeBadgeClass,
} from '@/lib/financeUtils'
import { invalidatePlannerDay } from '@/lib/queries/invalidate'
import {
  useBillsQuery,
  useEventsQuery,
  useExpensesQuery,
  useIncomeQuery,
} from '@/lib/queries/hooks'
import {
  isCheckListDayVisible,
  loadPlannerCheckListPrefs,
  savePlannerCheckListPrefs,
  toggleAllCheckLists,
  toggleCheckListDay,
  type PlannerCheckListPrefs,
} from '@/lib/plannerCheckListPrefs'
import {
  defaultCalendarFocusFilter,
  loadCalendarFocusFilter,
  saveCalendarFocusFilter,
  toggleCalendarFocusFilter,
  type CalendarFocusFilter,
} from '@/lib/calendarFocusFilter'
import type {
  CalendarBillItem,
  CalendarEventItem,
  CalendarExpenseItem,
  CalendarIncomeItem,
  CalendarItem,
} from '@/lib/calendarTypes'
import {
  buildMonthDays,
  calendarItemKey,
  endOfMonth,
  formatDayToggleLabel,
  isInRange,
  matchesCalendarItem,
  matchesScheduleItem,
  startOfMonth,
  toIsoDate,
} from '@/lib/calendarUtils'
import { describeRecurrence } from '@/lib/recurrence'
import type { Bill, Expense } from '@/lib/types'
import { cn } from '@/lib/utils'
import { workspaceHasFocus } from '@/lib/workspaceFocus'
import { ManageActions, useWorkspacePermissions } from '@/lib/workspacePermissions'
import { useAuthStore } from '@/stores/authStore'

function money(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function CalendarView() {
  const { workspaceId } = useParams()
  const location = useLocation()
  const token = useAuthStore((s) => s.token)
  const { canAddEntry, workspace } = useWorkspacePermissions()
  const queryClient = useQueryClient()
  const workspaceNumericId = workspaceId ? Number(workspaceId) : null
  const queriesEnabled = Boolean(token && workspaceNumericId)

  const showEventsFilter = workspaceHasFocus(workspace, 'planning')
  const showFinancesFilter = workspaceHasFocus(workspace, 'finances')

  const [cursor, setCursor] = useState(() => new Date())
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [payBill, setPayBill] = useState<Bill | null>(null)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payExpense, setPayExpense] = useState<Expense | null>(null)
  const [payExpenseDialogOpen, setPayExpenseDialogOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(() => {
    const state = location.state as { selectedDay?: string } | null
    return state?.selectedDay ?? null
  })
  const [addDate, setAddDate] = useState(() => toIsoDate(new Date()))
  const [addTab, setAddTab] = useState<AddDayEntryTab>('event')
  const [focusFilter, setFocusFilter] = useState<CalendarFocusFilter>(defaultCalendarFocusFilter)
  const [checkListPrefs, setCheckListPrefs] = useState<PlannerCheckListPrefs>({
    showAll: true,
    hiddenDays: [],
  })

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const todayIso = toIsoDate(new Date())

  const range = useMemo(() => ({
    start: startOfMonth(cursor).toISOString(),
    end: endOfMonth(cursor).toISOString(),
  }), [cursor])

  const eventsQuery = useEventsQuery(workspaceNumericId, range.start, range.end, queriesEnabled)
  const incomeQuery = useIncomeQuery(workspaceNumericId, range.start, range.end, queriesEnabled)
  const billsQuery = useBillsQuery(workspaceNumericId, range.start, range.end, queriesEnabled)
  const expensesQuery = useExpensesQuery(workspaceNumericId, queriesEnabled)

  const events = eventsQuery.data ?? []
  const income = incomeQuery.data ?? []
  const bills = billsQuery.data ?? []
  const expenses = useMemo(
    () => (expensesQuery.data ?? []).filter((expense) =>
      isInRange(normalizeFinanceDate(expense.expense_date), range.start, range.end),
    ),
    [expensesQuery.data, range.end, range.start],
  )

  function refreshCalendar(day?: string | null) {
    if (!workspaceNumericId) return
    void invalidatePlannerDay(queryClient, workspaceNumericId, day ?? selectedDay ?? addDate)
  }

  const days = useMemo(() => buildMonthDays(cursor), [cursor])

  const calendarItems = useMemo<CalendarItem[]>(() => {
    const eventItems: CalendarEventItem[] = events.map((event) => ({
      ...event,
      kind: 'event',
      date: event.start_at.slice(0, 10),
    }))
    const incomeItems: CalendarIncomeItem[] = income.map((item) => ({
      ...item,
      kind: 'income',
      date: normalizeFinanceDate(item.entry_date),
    }))
    const billItems: CalendarBillItem[] = bills.map((item) => ({
      ...item,
      kind: 'bill',
      date: normalizeFinanceDate(item.due_date),
    }))
    const expenseItems: CalendarExpenseItem[] = expenses.map((item) => ({
      ...item,
      kind: 'expense',
      date: normalizeFinanceDate(item.expense_date),
    }))
    return [...eventItems, ...incomeItems, ...billItems, ...expenseItems].filter((item) =>
      matchesCalendarItem(item, focusFilter),
    )
  }, [events, income, bills, expenses, focusFilter])

  const scheduleByDay = useMemo(() => {
    const map = new Map<string, PlannerScheduleItem[]>()

    const push = (day: string, item: PlannerScheduleItem) => {
      if (!matchesScheduleItem(item, focusFilter)) return
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
  }, [events, income, bills, expenses, focusFilter])

  const monthDayIsos = useMemo(
    () => days.filter((cell) => cell.date).map((cell) => toIsoDate(cell.date!)),
    [days],
  )

  useEffect(() => {
    if (!workspaceId) return
    setCheckListPrefs(loadPlannerCheckListPrefs(Number(workspaceId), 'calendar'))
    const saved = loadCalendarFocusFilter(Number(workspaceId))
    setFocusFilter({
      events: showEventsFilter ? saved.events : false,
      finances: showFinancesFilter ? saved.finances : false,
    })
  }, [workspaceId, showEventsFilter, showFinancesFilter])

  useEffect(() => {
    const state = location.state as { selectedDay?: string } | null
    if (state?.selectedDay) {
      setSelectedDay(state.selectedDay)
      setCursor(new Date(`${state.selectedDay}T12:00:00`))
    }
  }, [location.state])

  function persistFocusFilter(next: CalendarFocusFilter) {
    if (!workspaceId) return
    setFocusFilter(next)
    saveCalendarFocusFilter(Number(workspaceId), next)
  }

  function toggleFocusFilter(area: keyof CalendarFocusFilter) {
    persistFocusFilter(toggleCalendarFocusFilter(focusFilter, area))
  }

  useEffect(() => {
    setSelectedDay((current) => {
      if (current && monthDayIsos.includes(current)) return current
      return null
    })
  }, [monthDayIsos])

  function persistCheckListPrefs(next: PlannerCheckListPrefs) {
    if (!workspaceId) return
    setCheckListPrefs(next)
    savePlannerCheckListPrefs(Number(workspaceId), 'calendar', next)
  }

  function toggleDayCheckLists(day: string) {
    persistCheckListPrefs(toggleCheckListDay(checkListPrefs, day))
  }

  function itemsForDay(day: Date) {
    const iso = toIsoDate(day)
    return calendarItems.filter((item) => item.date === iso)
  }

  const upcomingItems = useMemo(
    () => calendarItems
      .filter((item) => item.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)),
    [calendarItems, todayIso],
  )

  function closeDialog() {
    setDialogOpen(false)
    setEditEntry(null)
  }

  function startAdd(day?: string, tab: AddDayEntryTab = 'event') {
    const targetDay = day ?? selectedDay ?? todayIso
    setAddDate(targetDay)
    setAddTab(tab)
    setEditEntry(null)
    setDialogOpen(true)
  }

  function startEdit(entry: EditableEntry) {
    setEditEntry(entry)
    setDialogOpen(true)
  }

  function startEditCalendarItem(item: CalendarItem) {
    if (item.kind === 'event') startEdit({ kind: 'event', data: item })
    else if (item.kind === 'income') startEdit({ kind: 'income', data: item })
    else if (item.kind === 'bill') startEdit({ kind: 'bill', data: item })
    else startEdit({ kind: 'expense', data: item })
  }

  function startPay(bill: Bill) {
    setPayBill(bill)
    setPayDialogOpen(true)
  }

  function startPayExpense(expense: Expense) {
    setPayExpense(expense)
    setPayExpenseDialogOpen(true)
  }

  function handleSelectDay(dayIso: string) {
    setSelectedDay((current) => (current === dayIso ? null : dayIso))
  }

  function closeSelectedDay() {
    setSelectedDay(null)
  }

  if (!token || !workspaceId || !workspaceNumericId) {
    return null
  }

  const splitView = selectedDay !== null

  function renderDayPanel(day: string) {
    return (
      <PlannerDayPanel
        day={day}
        dayLabel={formatDayToggleLabel(day)}
        dayItems={scheduleByDay.get(day) ?? []}
        checkListsVisible={isCheckListDayVisible(checkListPrefs, day)}
        token={token!}
        workspaceId={workspaceNumericId!}
        scrollContent={splitView}
        sectionLayout={splitView ? 'tabs' : 'stacked'}
        onToggleCheckLists={() => toggleDayCheckLists(day)}
        onAdd={() => startAdd(day)}
        onClose={closeSelectedDay}
        onEdit={startEdit}
        onPay={startPay}
        onPayExpense={startPayExpense}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        icon={CalendarDays}
        title="Calendar"
        subtitle={monthLabel}
        className="shrink-0"
      >
        <PageHeaderIconButton
          icon={ChevronLeft}
          label="Previous month"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        />
        <PageHeaderTextButton
          label="today"
          onClick={() => {
            setCursor(new Date())
            setSelectedDay(todayIso)
          }}
        />
        <PageHeaderIconButton
          icon={ChevronRight}
          label="Next month"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        />
        <PageHeaderDivider />
        {splitView ? (
          <>
            <PageHeaderIconButton
              icon={X}
              label="Close day"
              onClick={closeSelectedDay}
            />
            <PageHeaderDivider />
            <PageHeaderIconButton
              icon={ListChecks}
              label={checkListPrefs.showAll ? 'Hide all check lists' : 'Show all check lists'}
              onClick={() => persistCheckListPrefs(toggleAllCheckLists(checkListPrefs))}
            />
          </>
        ) : null}
        {canAddEntry ? (
        <PageHeaderIconButton
          icon={Plus}
          label="Add entry"
          onClick={() => startAdd()}
        />
        ) : null}
      </PageHeader>

      <div
        className={cn(
          splitView
            ? 'flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:gap-4 md:p-4'
            : 'min-h-0 flex-1 overflow-y-auto space-y-4 p-3 md:space-y-6 md:p-4',
        )}
      >
        {splitView ? (
          <>
            <CalendarMonthCard
              scrollContent
              days={days}
              selectedDay={selectedDay}
              todayIso={todayIso}
              itemsForDay={itemsForDay}
              onSelectDay={handleSelectDay}
              focusFilter={focusFilter}
              showEventsFilter={showEventsFilter}
              showFinancesFilter={showFinancesFilter}
              onToggleFocusFilter={toggleFocusFilter}
            />

            {selectedDay ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {renderDayPanel(selectedDay)}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <CalendarMonthCard
              days={days}
              selectedDay={selectedDay}
              todayIso={todayIso}
              itemsForDay={itemsForDay}
              onSelectDay={handleSelectDay}
              focusFilter={focusFilter}
              showEventsFilter={showEventsFilter}
              showFinancesFilter={showFinancesFilter}
              onToggleFocusFilter={toggleFocusFilter}
            />

            <Card>
              <CardHeader>
                <CardTitle>Upcoming this month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing upcoming this month.</p>
                ) : (
                  upcomingItems.map((item) => (
                    <UpcomingRow
                      key={calendarItemKey(item)}
                      item={item}
                      onEdit={() => startEditCalendarItem(item)}
                      onPay={item.kind === 'bill' ? () => startPay(item) : undefined}
                      onPayExpense={item.kind === 'expense' ? () => startPayExpense(item) : undefined}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
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
              refreshCalendar()
              closeDialog()
            }}
            onDeleted={() => {
              refreshCalendar()
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
              refreshCalendar()
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
        onComplete={() => refreshCalendar()}
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
        onComplete={() => refreshCalendar()}
      />
    </div>
  )
}

function UpcomingRow({
  item,
  onEdit,
  onPay,
  onPayExpense,
}: {
  item: CalendarItem
  onEdit: () => void
  onPay?: () => void
  onPayExpense?: () => void
}) {
  if (item.kind === 'event') {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <EntryTypeIcon kind="event" variant="badge" />
            <p className="font-medium">{item.title}</p>
            {item.is_recurring ? <Badge className="bg-secondary text-secondary-foreground">Recurring</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(item.start_at).toLocaleString()}
          </p>
          <OccurrenceMeta
            isRecurring={item.is_recurring}
            recurrence={describeRecurrence(item.recurrence, item.date)}
          />
        </div>
        <ManageActions area="planning">
          <EntryActionButtons onEdit={onEdit} />
        </ManageActions>
      </div>
    )
  }

  if (item.kind === 'income') {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <EntryTypeIcon kind="income" variant="badge" />
            <p className="font-medium">{item.title}</p>
            {item.is_recurring ? <Badge className="bg-secondary text-secondary-foreground">Recurring</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {money(item.amount)} · {formatDayLabel(item.date)}
          </p>
          {item.is_recurring ? (
            <p className="text-xs text-muted-foreground">{describeRecurrence(item.recurrence, item.date)}</p>
          ) : null}
        </div>
        <ManageActions area="finances">
          <EntryActionButtons onEdit={onEdit} />
        </ManageActions>
      </div>
    )
  }

  if (item.kind === 'expense') {
    const pastDue = !item.paid && !item.skipped && isPastDue(item.date)
    const dueSoon = !item.paid && !item.skipped && isDueSoon(item.date)

    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <EntryTypeIcon kind="expense" variant="badge" />
            <p className="font-medium">{item.title}</p>
            {pastDue ? <Badge className={pastDueBadgeClass}>Past due</Badge> : null}
            {dueSoon ? <Badge className={dueSoonBadgeClass}>Due soon</Badge> : null}
            {item.paid ? <Badge className={paidBadgeClass}>Paid</Badge> : null}
            {item.skipped ? <Badge className={skippedBadgeClass}>Skipped</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {money(item.amount)} · {formatDayLabel(item.date)}
            {item.paid && item.paid_at ? ` · paid ${formatDayLabel(item.paid_at)}` : ''}
          </p>
        </div>
        {onPayExpense ? (
          <ExpenseEntryActions expense={item} onPay={onPayExpense} onEdit={onEdit} />
        ) : (
          <ManageActions area="finances">
            <EntryActionButtons onEdit={onEdit} />
          </ManageActions>
        )}
      </div>
    )
  }

  const pastDue = !item.paid && !item.skipped && isPastDue(item.date)
  const dueSoon = !item.paid && !item.skipped && isDueSoon(item.date)

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <EntryTypeIcon kind="bill" variant="badge" />
          <p className="font-medium">{item.title}</p>
          {pastDue ? <Badge className={pastDueBadgeClass}>Past due</Badge> : null}
          {dueSoon ? <Badge className={dueSoonBadgeClass}>Due soon</Badge> : null}
          {item.paid ? <Badge className={paidBadgeClass}>Paid</Badge> : null}
          {item.skipped ? <Badge className="bg-secondary text-secondary-foreground">Skipped</Badge> : null}
          {item.is_recurring ? <Badge className={typeBadgeClass}>Recurring</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {money(item.amount)} · due {formatDayLabel(item.date)}
          {item.paid && item.paid_at ? ` · paid ${formatDayLabel(item.paid_at)}` : ''}
        </p>
        {item.is_recurring ? (
          <p className="text-xs text-muted-foreground">{describeRecurrence(item.recurrence, item.date)}</p>
        ) : null}
      </div>
      {onPay ? (
        <BillEntryActions bill={item} onPay={onPay} onEdit={onEdit} />
      ) : (
        <ManageActions area="finances">
          <EntryActionButtons onEdit={onEdit} />
        </ManageActions>
      )}
    </div>
  )
}
