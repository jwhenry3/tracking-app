import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ListChecks, Plus } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { PayBillDialog } from '@/components/finance/PayBillDialog'
import { PayExpenseDialog } from '@/components/finance/PayExpenseDialog'
import { EditEntryForm, type EditableEntry } from '@/components/ops/EditEntryForm'
import { OperationDialog } from '@/components/layout/OperationDialog'
import { PageHeader, PageHeaderDivider, PageHeaderIconButton } from '@/components/layout/PageHeader'
import { AddDayEntryForm, type AddDayEntryTab } from '@/components/planner/AddDayEntryForm'
import { PlannerDayPanel } from '@/components/planner/PlannerDayPanel'
import type { PlannerScheduleItem } from '@/components/planner/PlannerScheduleRow'
import { WeeklyPlannerGrid } from '@/components/planner/WeeklyPlannerGrid'
import { Card, CardContent } from '@/components/ui/card'
import { formatDayLabel, normalizeFinanceDate } from '@/lib/financeUtils'
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
import { cn } from '@/lib/utils'
import type { Bill, Expense } from '@/lib/types'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'
import { useAuthStore } from '@/stores/authStore'

type PlannerViewProps = {
  mode: 'daily' | 'weekly'
}

const plannerMeta = {
  daily: { title: 'Daily planner', icon: CalendarDays },
  weekly: { title: 'Weekly planner', icon: CalendarRange },
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
  const start = addDays(anchor, -anchor.getDay())
  return Array.from({ length: 7 }, (_, index) => isoDate(addDays(start, index)))
}

function isInRange(iso: string, start: string, end: string) {
  const day = iso.slice(0, 10)
  return day >= start.slice(0, 10) && day <= end.slice(0, 10)
}

function formatDayToggleLabel(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function PlannerView({ mode }: PlannerViewProps) {
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
  const { canAddEntry } = useWorkspacePermissions()
  const queryClient = useQueryClient()
  const workspaceNumericId = workspaceId ? Number(workspaceId) : null
  const queriesEnabled = Boolean(token && workspaceNumericId)
  const [anchor, setAnchor] = useState(() => new Date())
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [addDate, setAddDate] = useState(() => isoDate(new Date()))
  const [addTab, setAddTab] = useState<AddDayEntryTab>('event')
  const [payBill, setPayBill] = useState<Bill | null>(null)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payExpense, setPayExpense] = useState<Expense | null>(null)
  const [payExpenseDialogOpen, setPayExpenseDialogOpen] = useState(false)
  const [selectedWeekDay, setSelectedWeekDay] = useState<string | null>(null)
  const [checkListPrefs, setCheckListPrefs] = useState<PlannerCheckListPrefs>({
    showAll: true,
    hiddenDays: [],
  })

  const todayIso = isoDate(new Date())

  const range = useMemo(() => {
    if (mode === 'daily') {
      const day = isoDate(anchor)
      return { start: `${day}T00:00:00Z`, end: `${day}T23:59:59Z`, label: anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) }
    }
    const start = addDays(anchor, -anchor.getDay())
    const end = addDays(start, 6)
    return {
      start: `${isoDate(start)}T00:00:00Z`,
      end: `${isoDate(end)}T23:59:59Z`,
      label: `Week of ${start.toLocaleDateString()}`,
    }
  }, [anchor, mode])

  const plannerDays = useMemo(() => datesInPlannerRange(mode, anchor), [mode, anchor])

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

  function refreshPlanner(day?: string | null) {
    if (!workspaceNumericId) return
    const targetDay = day ?? (mode === 'weekly' ? selectedWeekDay : plannerDays[0]) ?? addDate
    void invalidatePlannerDay(queryClient, workspaceNumericId, targetDay)
  }

  useEffect(() => {
    if (!workspaceId) return
    setCheckListPrefs(loadPlannerCheckListPrefs(Number(workspaceId), mode))
  }, [workspaceId, mode])

  useEffect(() => {
    if (mode !== 'weekly') return
    setSelectedWeekDay((current) => {
      if (current && plannerDays.includes(current)) return current
      if (plannerDays.includes(todayIso)) return todayIso
      return plannerDays[0] ?? null
    })
  }, [mode, plannerDays, todayIso])

  function persistCheckListPrefs(next: PlannerCheckListPrefs) {
    if (!workspaceId) return
    setCheckListPrefs(next)
    savePlannerCheckListPrefs(Number(workspaceId), mode, next)
  }

  function toggleDayCheckLists(day: string) {
    persistCheckListPrefs(toggleCheckListDay(checkListPrefs, day))
  }

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

  if (!token || !workspaceId || !workspaceNumericId) {
    return null
  }

  const planner = plannerMeta[mode]
  const step = mode === 'daily' ? 1 : 7
  const defaultAddDay = mode === 'weekly' && selectedWeekDay ? selectedWeekDay : isoDate(anchor)

  function renderDayPanel(day: string) {
    const dayLabel = formatDayToggleLabel(day)
    const checkListsVisible = isCheckListDayVisible(checkListPrefs, day)
    const dayItems = scheduleByDay.get(day) ?? []

    return (
      <PlannerDayPanel
        day={day}
        dayLabel={dayLabel}
        dayItems={dayItems}
        checkListsVisible={checkListsVisible}
        token={token!}
        workspaceId={workspaceNumericId!}
        scrollContent={mode === 'weekly'}
        onToggleCheckLists={() => toggleDayCheckLists(day)}
        onAdd={() => startAdd(day)}
        onEdit={startEdit}
        onPay={startPay}
        onPayExpense={startPayExpense}
      />
    )
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-1 flex-col overflow-hidden', mode === 'weekly' && 'min-h-0')}>
      <PageHeader
        icon={planner.icon}
        title={planner.title}
        subtitle={range.label}
        className="shrink-0"
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
          icon={ListChecks}
          label={checkListPrefs.showAll ? 'Hide all check lists' : 'Show all check lists'}
          onClick={() => persistCheckListPrefs(toggleAllCheckLists(checkListPrefs))}
        />
        {canAddEntry ? (
        <PageHeaderIconButton
          icon={Plus}
          label="Add entry"
          onClick={() => startAdd(defaultAddDay)}
        />
        ) : null}
      </PageHeader>

      <div
        className={cn(
          mode === 'weekly'
            ? 'flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:gap-4 md:p-4'
            : 'min-h-0 flex-1 overflow-y-auto space-y-4 p-3 md:space-y-6 md:p-4',
        )}
      >
        {mode === 'weekly' ? (
          <>
            <div className="shrink-0">
              <WeeklyPlannerGrid
                days={plannerDays}
                scheduleByDay={scheduleByDay}
                selectedDay={selectedWeekDay}
                todayIso={todayIso}
                onSelectDay={setSelectedWeekDay}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {selectedWeekDay ? (
                renderDayPanel(selectedWeekDay)
              ) : (
                <Card className="flex h-full w-full flex-col overflow-hidden">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Select a day to view its planner.
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        ) : (
          <div className="mx-auto max-w-3xl">
            {renderDayPanel(plannerDays[0])}
          </div>
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
              refreshPlanner()
              closeDialog()
            }}
            onDeleted={() => {
              refreshPlanner()
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
              refreshPlanner()
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
        onComplete={() => refreshPlanner()}
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
        onComplete={() => refreshPlanner()}
      />
    </div>
  )
}
