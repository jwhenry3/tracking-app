import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { AddEventForm } from '@/components/ops/AddEventForm'
import { EditEntryForm, type EditableEntry } from '@/components/ops/EditEntryForm'
import { EntryActionButtons } from '@/components/ops/EntryActionButtons'
import { BillEntryActions } from '@/components/finance/BillEntryActions'
import { PayBillDialog } from '@/components/finance/PayBillDialog'
import { OccurrenceMeta } from '@/components/forms/OccurrenceScopePicker'
import { OperationDialog } from '@/components/layout/OperationDialog'
import { PageHeader, PageHeaderDivider, PageHeaderIconButton, PageHeaderTextButton } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchBills, fetchEvents, fetchIncome } from '@/lib/api'
import { billChipColor, dueSoonBadgeClass, formatDayLabel, isDueSoon, isPastDue, normalizeFinanceDate, paidBadgeClass, pastDueBadgeClass, typeBadgeClass } from '@/lib/financeUtils'
import { describeRecurrence } from '@/lib/recurrence'
import type { Bill, IncomeEntry, PlannerEvent } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

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
type CalendarEventItem = PlannerEvent & { kind: 'event'; date: string }

type CalendarItem = CalendarEventItem | CalendarIncomeItem | CalendarBillItem

const financeColors = {
  income: '#15803d',
} as const

export function CalendarView() {
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
  const setOnUpdate = useRealtimeStore((s) => s.setOnUpdate)

  const [cursor, setCursor] = useState(() => new Date())
  const [events, setEvents] = useState<PlannerEvent[]>([])
  const [income, setIncome] = useState<IncomeEntry[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [payBill, setPayBill] = useState<Bill | null>(null)
  const [payDialogOpen, setPayDialogOpen] = useState(false)

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const todayIso = toIsoDate(new Date())

  const range = useMemo(() => ({
    start: startOfMonth(cursor).toISOString(),
    end: endOfMonth(cursor).toISOString(),
  }), [cursor])

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
    return [...eventItems, ...incomeItems, ...billItems]
  }, [events, income, bills])

  async function loadCalendar() {
    if (!token || !workspaceId) return
    const id = Number(workspaceId)
    const [eventsData, incomeData, billsData] = await Promise.all([
      fetchEvents(token, id, range.start, range.end),
      fetchIncome(token, id, range.start, range.end),
      fetchBills(token, id, range.start, range.end),
    ])
    setEvents(eventsData.events)
    setIncome(incomeData.income)
    setBills(billsData.bills)
  }

  useEffect(() => {
    void loadCalendar()
  }, [token, workspaceId, range.start, range.end])

  useEffect(() => {
    setOnUpdate(() => {
      void loadCalendar()
    })
    return () => setOnUpdate(null)
  }, [token, workspaceId, range.start, range.end])

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

  function startAdd() {
    setEditEntry(null)
    setDialogOpen(true)
  }

  function startEdit(item: CalendarItem) {
    if (item.kind === 'event') setEditEntry({ kind: 'event', data: item })
    else if (item.kind === 'income') setEditEntry({ kind: 'income', data: item })
    else setEditEntry({ kind: 'bill', data: item })
    setDialogOpen(true)
  }

  function startPay(bill: Bill) {
    setPayBill(bill)
    setPayDialogOpen(true)
  }

  if (!token || !workspaceId) {
    return null
  }

  return (
    <>
      <PageHeader
        icon={CalendarDays}
        title="Calendar"
        subtitle={monthLabel}
      >
        <PageHeaderIconButton
          icon={ChevronLeft}
          label="Previous month"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        />
        <PageHeaderTextButton label="today" onClick={() => setCursor(new Date())} />
        <PageHeaderIconButton
          icon={ChevronRight}
          label="Next month"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        />
        <PageHeaderDivider />
        <PageHeaderIconButton icon={Plus} label="Add event" onClick={startAdd} />
      </PageHeader>

      <div className="space-y-6 p-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#2563eb]" /> Events</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#15803d]" /> Income</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#dc2626]" /> Bills due</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#15803d]" /> Bills paid</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#94a3b8]" /> Bills skipped</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-2 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                <div key={label} className="py-2">{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {days.map(({ date: day, key }) => (
                <div
                  key={key}
                  className={cn(
                    'min-h-28 rounded-lg border p-2',
                    day && toIsoDate(day) === todayIso && 'border-primary bg-primary/5',
                  )}
                >
                  {day ? (
                    <>
                      <div className="mb-2 text-sm font-medium">{day.getDate()}</div>
                      <div className="space-y-1">
                        {itemsForDay(day).map((item) => (
                          <CalendarChip key={`${item.kind}-${item.occurrence_id}`} item={item} />
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

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
                  key={`${item.kind}-${item.occurrence_id}`}
                  item={item}
                  onEdit={() => startEdit(item)}
                  onPay={item.kind === 'bill' ? () => startPay(item) : undefined}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <OperationDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditEntry(null)
        }}
        title={editEntry ? 'Edit entry' : 'Add event'}
        description={editEntry ? 'Update or remove this item.' : 'Create a shared calendar event for this workspace.'}
      >
        {editEntry ? (
          <EditEntryForm
            key={`${editEntry.kind}-${editEntry.kind === 'expense' ? editEntry.data.id : editEntry.data.occurrence_id}`}
            token={token}
            workspaceId={Number(workspaceId)}
            entry={editEntry}
            onSaved={() => {
              void loadCalendar()
              closeDialog()
            }}
            onDeleted={() => {
              void loadCalendar()
              closeDialog()
            }}
          />
        ) : (
          <AddEventForm
            token={token}
            workspaceId={Number(workspaceId)}
            onCreated={() => {
              void loadCalendar()
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
        workspaceId={Number(workspaceId)}
        bill={payBill}
        onComplete={() => void loadCalendar()}
      />
    </>
  )
}

function CalendarChip({ item }: { item: CalendarItem }) {
  if (item.kind === 'event') {
    return (
      <div
        className="truncate rounded px-1.5 py-0.5 text-xs text-white"
        style={{ backgroundColor: item.color }}
        title={item.is_recurring ? describeRecurrence(item.recurrence, item.date) : item.title}
      >
        {item.title}
        {item.is_recurring ? ' ↻' : ''}
      </div>
    )
  }

  if (item.kind === 'income') {
    return (
      <div
        className="truncate rounded px-1.5 py-0.5 text-xs text-white"
        style={{ backgroundColor: financeColors.income }}
        title={item.is_recurring ? describeRecurrence(item.recurrence, item.date) : item.title}
      >
        +{money(item.amount)} {item.title}
        {item.is_recurring ? ' ↻' : ''}
      </div>
    )
  }

  return (
    <div
      className="truncate rounded px-1.5 py-0.5 text-xs text-white"
      style={{ backgroundColor: billChipColor(item) }}
      title={item.is_recurring ? describeRecurrence(item.recurrence, item.date) : item.title}
    >
      {item.paid ? '✓' : item.skipped ? '–' : '!'}{money(item.amount)} {item.title}
      {item.is_recurring ? ' ↻' : ''}
    </div>
  )
}

function UpcomingRow({
  item,
  onEdit,
  onPay,
}: {
  item: CalendarItem
  onEdit: () => void
  onPay?: () => void
}) {
  if (item.kind === 'event') {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-[#2563eb] text-white">Event</Badge>
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
        <EntryActionButtons onEdit={onEdit} />
      </div>
    )
  }

  if (item.kind === 'income') {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-[#15803d] text-white">Income</Badge>
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
        <EntryActionButtons onEdit={onEdit} />
      </div>
    )
  }

  const pastDue = !item.paid && !item.skipped && isPastDue(item.date)
  const dueSoon = !item.paid && !item.skipped && isDueSoon(item.date)

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div>
        <div className="flex items-center gap-2">
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
          {item.paid && item.paid_at ? ` · paid ${formatDayLabel(item.paid_at)}` : ''}
        </p>
        {item.is_recurring ? (
          <p className="text-xs text-muted-foreground">{describeRecurrence(item.recurrence, item.date)}</p>
        ) : null}
      </div>
      {onPay ? (
        <BillEntryActions bill={item} onPay={onPay} onEdit={onEdit} />
      ) : (
        <EntryActionButtons onEdit={onEdit} />
      )}
    </div>
  )
}
