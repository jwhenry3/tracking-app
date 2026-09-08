import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks, Plus } from 'lucide-react'
import { useParams } from 'react-router-dom'

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
import { ScheduleChip } from '@/components/planner/ScheduleChip'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { dueSoonBadgeClass, formatDayLabel, isDueSoon, isPastDue, normalizeFinanceDate, paidBadgeClass, pastDueBadgeClass, skippedBadgeClass, typeBadgeClass } from '@/lib/financeUtils'
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
import { passWheelToScrollParent } from '@/lib/nestedScroll'
import { describeRecurrence } from '@/lib/recurrence'
import { calendarLegendColors } from '@/lib/scheduleChipStyles'
import type { Bill, Expense, IncomeEntry, PlannerEvent } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ManageActions, useWorkspacePermissions } from '@/lib/workspacePermissions'
import { useAuthStore } from '@/stores/authStore'

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59)
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function money(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

type CalendarIncomeItem = IncomeEntry & { kind: 'income'; date: string }
type CalendarBillItem = Bill & { kind: 'bill'; date: string }
type CalendarExpenseItem = Expense & { kind: 'expense'; date: string }
type CalendarEventItem = PlannerEvent & { kind: 'event'; date: string }

type CalendarItem = CalendarEventItem | CalendarIncomeItem | CalendarBillItem | CalendarExpenseItem

function isInRange(iso: string, start: string, end: string) {
  const day = iso.slice(0, 10)
  return day >= start.slice(0, 10) && day <= end.slice(0, 10)
}

function calendarItemKey(item: CalendarItem) {
  if (item.kind === 'expense') return `expense-${item.id}`
  return `${item.kind}-${item.occurrence_id}`
}

function formatDayToggleLabel(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

const VISIBLE_CHIP_COUNT = 5
const CHIP_VIEWPORT_HEIGHT = `calc(${VISIBLE_CHIP_COUNT} * 1.375rem + ${VISIBLE_CHIP_COUNT - 1} * 0.25rem)`

function CalendarLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><LegendSwatch color={calendarLegendColors.event} /> Events</span>
      <span className="inline-flex items-center gap-1.5"><LegendSwatch color={calendarLegendColors.income} /> Income</span>
      <span className="inline-flex items-center gap-1.5"><LegendSwatch color={calendarLegendColors.billDue} /> Bills due</span>
      <span className="inline-flex items-center gap-1.5"><LegendSwatch color={calendarLegendColors.billPaid} /> Bills paid</span>
      <span className="inline-flex items-center gap-1.5"><LegendSwatch color={calendarLegendColors.billSkipped} /> Bills skipped</span>
      <span className="inline-flex items-center gap-1.5"><LegendSwatch color={calendarLegendColors.expense} /> Expenses</span>
    </div>
  )
}

function CalendarMonthGrid({
  days,
  selectedDay,
  todayIso,
  itemsForDay,
  onSelectDay,
}: {
  days: Array<{ date: Date | null; key: string }>
  selectedDay: string | null
  todayIso: string
  itemsForDay: (day: Date) => CalendarItem[]
  onSelectDay: (dayIso: string) => void
}) {
  return (
    <>
      <div className="sticky top-0 z-10 mb-2 grid grid-cols-7 bg-card text-center text-xs font-medium text-muted-foreground">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <div key={label} className="py-2">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2 items-stretch">
        {days.map(({ date: day, key }) => {
          const dayIso = day ? toIsoDate(day) : null
          const isSelected = dayIso !== null && dayIso === selectedDay
          const isToday = dayIso === todayIso

          if (!day) {
            return <div key={key} className="min-h-0" aria-hidden="true" />
          }

          const dayItems = itemsForDay(day)
          const chipListScrollable = dayItems.length > VISIBLE_CHIP_COUNT

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(dayIso!)}
              className={cn(
                'flex h-full min-h-0 flex-col items-stretch justify-start rounded-lg border p-2 text-left transition-colors',
                'hover:bg-muted/40',
                isToday && 'border-primary bg-primary/5',
                isSelected && 'ring-2 ring-primary bg-primary/10',
              )}
            >
              <div className="mb-2 shrink-0 text-sm font-medium leading-none">{day.getDate()}</div>
              <div
                className={cn(
                  'w-full shrink-0 space-y-1',
                  chipListScrollable && 'overflow-y-auto [scrollbar-gutter:stable]',
                )}
                style={{ height: CHIP_VIEWPORT_HEIGHT }}
                onWheel={chipListScrollable ? passWheelToScrollParent : undefined}
              >
                {dayItems.map((item) => (
                  <ScheduleChip key={calendarItemKey(item)} item={item} />
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

function CalendarMonthCard({
  days,
  selectedDay,
  todayIso,
  itemsForDay,
  onSelectDay,
  scrollContent = false,
}: {
  days: Array<{ date: Date | null; key: string }>
  selectedDay: string | null
  todayIso: string
  itemsForDay: (day: Date) => CalendarItem[]
  onSelectDay: (dayIso: string) => void
  scrollContent?: boolean
}) {
  return (
    <Card className={cn(scrollContent && 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <CardHeader className={cn('pb-3', scrollContent && 'shrink-0')}>
        <CalendarLegend />
      </CardHeader>
      <CardContent
        className={cn(
          scrollContent && 'min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]',
        )}
      >
        <CalendarMonthGrid
          days={days}
          selectedDay={selectedDay}
          todayIso={todayIso}
          itemsForDay={itemsForDay}
          onSelectDay={onSelectDay}
        />
      </CardContent>
    </Card>
  )
}

function LegendSwatch({ color }: { color: string }) {
  return (
    <span
      className="schedule-chip-swatch"
      style={{ '--schedule-chip-color': color } as React.CSSProperties}
    />
  )
}

export function CalendarView() {
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
  const { canAddEntry } = useWorkspacePermissions()
  const queryClient = useQueryClient()
  const workspaceNumericId = workspaceId ? Number(workspaceId) : null
  const queriesEnabled = Boolean(token && workspaceNumericId)

  const [cursor, setCursor] = useState(() => new Date())
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [payBill, setPayBill] = useState<Bill | null>(null)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payExpense, setPayExpense] = useState<Expense | null>(null)
  const [payExpenseDialogOpen, setPayExpenseDialogOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [addDate, setAddDate] = useState(() => toIsoDate(new Date()))
  const [addTab, setAddTab] = useState<AddDayEntryTab>('event')
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

  const days = useMemo(() => {
    const first = startOfMonth(cursor)
    const last = endOfMonth(cursor)
    const startPad = first.getDay()
    const totalDays = last.getDate()
    const cells: Array<{ date: Date | null; key: string }> = []

    for (let i = 0; i < startPad; i += 1) {
      cells.push({ date: null, key: `pad-${i}` })
    }
    for (let day = 1; day <= totalDays; day += 1) {
      cells.push({
        date: new Date(cursor.getFullYear(), cursor.getMonth(), day),
        key: `day-${day}`,
      })
    }
    return cells
  }, [cursor])

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
    return [...eventItems, ...incomeItems, ...billItems, ...expenseItems]
  }, [events, income, bills, expenses])

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

  const monthDayIsos = useMemo(
    () => days.filter((cell) => cell.date).map((cell) => toIsoDate(cell.date!)),
    [days],
  )

  useEffect(() => {
    if (!workspaceId) return
    setCheckListPrefs(loadPlannerCheckListPrefs(Number(workspaceId), 'calendar'))
  }, [workspaceId])

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
          <PageHeaderIconButton
            icon={ListChecks}
            label={checkListPrefs.showAll ? 'Hide all check lists' : 'Show all check lists'}
            onClick={() => persistCheckListPrefs(toggleAllCheckLists(checkListPrefs))}
          />
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
            ? 'flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4'
            : 'min-h-0 flex-1 overflow-y-auto space-y-6 p-4',
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
              onSelectDay={setSelectedDay}
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
              onSelectDay={setSelectedDay}
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
        <div>
          <div className="flex items-center gap-2">
            <EntryTypeIcon kind="event" />
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
        <div>
          <div className="flex items-center gap-2">
            <EntryTypeIcon kind="income" />
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
        <div>
          <div className="flex items-center gap-2">
            <EntryTypeIcon kind="expense" />
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
      <div>
        <div className="flex items-center gap-2">
          <EntryTypeIcon kind="bill" />
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
