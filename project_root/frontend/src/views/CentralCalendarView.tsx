import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { CalendarMonthCard } from '@/components/calendar/CalendarMonthCard'
import { WorkspaceMultiSelect } from '@/components/calendar/WorkspaceMultiSelect'
import { EntryTypeIcon } from '@/components/ops/EntryTypeIcon'
import { OccurrenceMeta } from '@/components/forms/OccurrenceScopePicker'
import { PageHeader, PageHeaderDivider, PageHeaderIconButton, PageHeaderTextButton } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  defaultCalendarFocusFilter,
  loadCentralCalendarFocusFilter,
  saveCentralCalendarFocusFilter,
  toggleCalendarFocusFilter,
  type CalendarFocusFilter,
} from '@/lib/calendarFocusFilter'
import {
  loadCentralCalendarWorkspaceFilter,
  saveCentralCalendarWorkspaceFilter,
} from '@/lib/centralCalendarWorkspaceFilter'
import type { CentralCalendarItem } from '@/lib/calendarTypes'
import {
  buildMonthDays,
  calendarItemKey,
  endOfMonth,
  formatDayToggleLabel,
  startOfMonth,
  toIsoDate,
  workspaceInitials,
} from '@/lib/calendarUtils'
import {
  dueSoonBadgeClass,
  formatDayLabel,
  isDueSoon,
  isPastDue,
  paidBadgeClass,
  pastDueBadgeClass,
  skippedBadgeClass,
  typeBadgeClass,
} from '@/lib/financeUtils'
import { useCentralCalendarData } from '@/lib/queries/hooks'
import { describeRecurrence } from '@/lib/recurrence'
import { workspaceHasFocus } from '@/lib/workspaceFocus'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

function money(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function CentralCalendarView() {
  const navigate = useNavigate()
  const workspaces = useAuthStore((state) => state.workspaces)
  const setActiveWorkspace = useAuthStore((state) => state.setActiveWorkspace)
  const workspaceIds = useMemo(() => workspaces.map((workspace) => workspace.id), [workspaces])

  const showEventsFilter = workspaces.some((workspace) => workspaceHasFocus(workspace, 'planning'))
  const showFinancesFilter = workspaces.some((workspace) => workspaceHasFocus(workspace, 'finances'))

  const [cursor, setCursor] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [focusFilter, setFocusFilter] = useState<CalendarFocusFilter>(defaultCalendarFocusFilter)
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<number[]>(() =>
    loadCentralCalendarWorkspaceFilter(workspaceIds),
  )

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const todayIso = toIsoDate(new Date())

  const range = useMemo(
    () => ({
      start: startOfMonth(cursor).toISOString(),
      end: endOfMonth(cursor).toISOString(),
    }),
    [cursor],
  )

  const { calendarItems, isLoading, workspaceLabels } = useCentralCalendarData(
    workspaces,
    range,
    focusFilter,
    selectedWorkspaceIds,
  )
  const days = useMemo(() => buildMonthDays(cursor), [cursor])

  const monthDayIsos = useMemo(
    () => days.filter((cell) => cell.date).map((cell) => toIsoDate(cell.date!)),
    [days],
  )

  useEffect(() => {
    const saved = loadCentralCalendarFocusFilter()
    setFocusFilter({
      events: showEventsFilter ? saved.events : false,
      finances: showFinancesFilter ? saved.finances : false,
    })
  }, [showEventsFilter, showFinancesFilter])

  useEffect(() => {
    setSelectedWorkspaceIds((current) => {
      const saved = loadCentralCalendarWorkspaceFilter(workspaceIds)
      if (workspaceIds.length === 0) return current
      if (current.length === 0) return saved
      const allowed = new Set(workspaceIds)
      const next = current.filter((id) => allowed.has(id))
      return next.length > 0 ? next : saved
    })
  }, [workspaceIds])

  useEffect(() => {
    setSelectedDay((current) => {
      if (current && monthDayIsos.includes(current)) return current
      return null
    })
  }, [monthDayIsos])

  function persistFocusFilter(next: CalendarFocusFilter) {
    setFocusFilter(next)
    saveCentralCalendarFocusFilter(next)
  }

  function toggleFocusFilter(area: keyof CalendarFocusFilter) {
    persistFocusFilter(toggleCalendarFocusFilter(focusFilter, area))
  }

  function persistWorkspaceFilter(next: number[]) {
    setSelectedWorkspaceIds(next)
    saveCentralCalendarWorkspaceFilter(next)
  }

  function handleSelectDay(dayIso: string) {
    setSelectedDay((current) => (current === dayIso ? null : dayIso))
  }

  function closeSelectedDay() {
    setSelectedDay(null)
  }

  function itemsForDay(day: Date) {
    const iso = toIsoDate(day)
    return calendarItems
      .filter((item) => item.date === iso)
      .map((item) => ({
        ...item,
        workspaceLabel: workspaceLabels[item.workspaceId],
      }))
  }

  const upcomingItems = useMemo(
    () =>
      calendarItems
        .filter((item) => item.date >= todayIso)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.workspaceName.localeCompare(b.workspaceName) ||
            a.title.localeCompare(b.title),
        ),
    [calendarItems, todayIso],
  )

  const selectedDayItems = useMemo(() => {
    if (!selectedDay) return []
    return calendarItems.filter((item) => item.date === selectedDay)
  }, [calendarItems, selectedDay])

  const selectedDayByWorkspace = useMemo(() => {
    const grouped = new Map<number, CentralCalendarItem[]>()
    for (const item of selectedDayItems) {
      grouped.set(item.workspaceId, [...(grouped.get(item.workspaceId) ?? []), item])
    }
    return grouped
  }, [selectedDayItems])

  function openWorkspaceDay(workspaceId: number, day: string) {
    setActiveWorkspace(workspaceId)
    navigate(`/w/${workspaceId}/calendar`, { state: { selectedDay: day } })
  }

  const splitView = selectedDay !== null

  const calendarHeaderActions = (
    <WorkspaceMultiSelect
      workspaces={workspaces}
      selectedIds={selectedWorkspaceIds}
      onChange={persistWorkspaceFilter}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        icon={CalendarDays}
        title="All calendars"
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
        {splitView ? (
          <>
            <PageHeaderDivider />
            <PageHeaderIconButton icon={X} label="Close day" onClick={closeSelectedDay} />
          </>
        ) : null}
      </PageHeader>

      <div
        className={cn(
          splitView
            ? 'flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:gap-4 md:p-4'
            : 'min-h-0 flex-1 space-y-4 overflow-y-auto p-3 md:space-y-6 md:p-4',
        )}
      >
        {isLoading && calendarItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading schedule…</p>
        ) : null}

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
              headerActions={calendarHeaderActions}
            />

            {selectedDay ? (
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <CardHeader className="shrink-0">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{formatDayToggleLabel(selectedDay)}</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      title="Close day"
                      aria-label="Close day"
                      onClick={closeSelectedDay}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                  {selectedDayItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing scheduled this day.</p>
                  ) : (
                    [...selectedDayByWorkspace.entries()].map(([workspaceId, items]) => {
                      const workspaceName = items[0]?.workspaceName ?? 'Workspace'
                      return (
                        <div key={workspaceId} className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
                                {workspaceInitials(workspaceName)}
                              </span>
                              <p className="font-medium">{workspaceName}</p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openWorkspaceDay(workspaceId, selectedDay)}
                            >
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                              Open
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {items.map((item) => (
                              <CentralUpcomingRow key={calendarItemKey(item, item.workspaceId)} item={item} />
                            ))}
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
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
              headerActions={calendarHeaderActions}
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
                    <CentralUpcomingRow
                      key={calendarItemKey(item, item.workspaceId)}
                      item={item}
                      onOpen={() => openWorkspaceDay(item.workspaceId, item.date)}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function CentralUpcomingRow({
  item,
  onOpen,
}: {
  item: CentralCalendarItem
  onOpen?: () => void
}) {
  const workspaceBadge = (
    <Badge className="shrink-0 bg-secondary text-secondary-foreground">
      {workspaceInitials(item.workspaceName)}
    </Badge>
  )

  if (item.kind === 'event') {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <EntryTypeIcon kind="event" variant="badge" />
            {workspaceBadge}
            <p className="font-medium">{item.title}</p>
            {item.is_recurring ? <Badge className="bg-secondary text-secondary-foreground">Recurring</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {item.workspaceName} · {new Date(item.start_at).toLocaleString()}
          </p>
          <OccurrenceMeta
            isRecurring={item.is_recurring}
            recurrence={describeRecurrence(item.recurrence, item.date)}
          />
        </div>
        {onOpen ? (
          <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
            Open
          </Button>
        ) : null}
      </div>
    )
  }

  if (item.kind === 'income') {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <EntryTypeIcon kind="income" variant="badge" />
            {workspaceBadge}
            <p className="font-medium">{item.title}</p>
            {item.is_recurring ? <Badge className="bg-secondary text-secondary-foreground">Recurring</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {item.workspaceName} · {money(item.amount)} · {formatDayLabel(item.date)}
          </p>
        </div>
        {onOpen ? (
          <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
            Open
          </Button>
        ) : null}
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
            {workspaceBadge}
            <p className="font-medium">{item.title}</p>
            {pastDue ? <Badge className={pastDueBadgeClass}>Past due</Badge> : null}
            {dueSoon ? <Badge className={dueSoonBadgeClass}>Due soon</Badge> : null}
            {item.paid ? <Badge className={paidBadgeClass}>Paid</Badge> : null}
            {item.skipped ? <Badge className={skippedBadgeClass}>Skipped</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {item.workspaceName} · {money(item.amount)} · {formatDayLabel(item.date)}
          </p>
        </div>
        {onOpen ? (
          <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
            Open
          </Button>
        ) : null}
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
          {workspaceBadge}
          <p className="font-medium">{item.title}</p>
          {pastDue ? <Badge className={pastDueBadgeClass}>Past due</Badge> : null}
          {dueSoon ? <Badge className={dueSoonBadgeClass}>Due soon</Badge> : null}
          {item.paid ? <Badge className={paidBadgeClass}>Paid</Badge> : null}
          {item.skipped ? <Badge className="bg-secondary text-secondary-foreground">Skipped</Badge> : null}
          {item.is_recurring ? <Badge className={typeBadgeClass}>Recurring</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {item.workspaceName} · {money(item.amount)} · due {formatDayLabel(item.date)}
        </p>
      </div>
      {onOpen ? (
        <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
          Open
        </Button>
      ) : null}
    </div>
  )
}
