import type { CSSProperties, ReactNode } from 'react'

import { ScheduleChip } from '@/components/planner/ScheduleChip'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { CalendarFocusFilter } from '@/lib/calendarFocusFilter'
import type { CalendarItem } from '@/lib/calendarTypes'
import {
  calendarItemKey,
  CHIP_VIEWPORT_HEIGHT,
  dayDotColors,
  toIsoDate,
  VISIBLE_CHIP_COUNT,
  WEEKDAY_LABELS,
} from '@/lib/calendarUtils'
import { groupItemsByWorkspace } from '@/lib/workspaceColors'
import { passWheelToScrollParent } from '@/lib/nestedScroll'
import { calendarLegendColors } from '@/lib/scheduleChipStyles'
import { cn } from '@/lib/utils'

function LegendSwatch({ color }: { color: string }) {
  return (
    <span
      className="schedule-chip-swatch"
      style={{ '--schedule-chip-color': color } as CSSProperties}
    />
  )
}

function CalendarLegend({
  filter,
  showEvents,
  showFinances,
}: {
  filter: CalendarFocusFilter
  showEvents: boolean
  showFinances: boolean
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground md:text-xs">
      {showEvents && filter.events ? (
        <span className="inline-flex items-center gap-1.5">
          <LegendSwatch color={calendarLegendColors.event} /> Events
        </span>
      ) : null}
      {showFinances && filter.finances ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <LegendSwatch color={calendarLegendColors.income} /> Income
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LegendSwatch color={calendarLegendColors.billDue} /> Bills due
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LegendSwatch color={calendarLegendColors.billPaid} /> Bills paid
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LegendSwatch color={calendarLegendColors.billSkipped} /> Bills skipped
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LegendSwatch color={calendarLegendColors.expense} /> Expenses
          </span>
        </>
      ) : null}
    </div>
  )
}

export function CalendarFocusFilters({
  filter,
  showEvents,
  showFinances,
  onToggle,
}: {
  filter: CalendarFocusFilter
  showEvents: boolean
  showFinances: boolean
  onToggle: (area: keyof CalendarFocusFilter) => void
}) {
  if (!showEvents || !showFinances) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={filter.events}
        onClick={() => onToggle('events')}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs font-medium transition',
          filter.events
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:text-foreground',
        )}
      >
        Events
      </button>
      <button
        type="button"
        aria-pressed={filter.finances}
        onClick={() => onToggle('finances')}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs font-medium transition',
          filter.finances
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:text-foreground',
        )}
      >
        Finances
      </button>
    </div>
  )
}

type CalendarChipItem = CalendarItem & { workspaceId?: number }

function DayChipList({
  dayItems,
  groupChipsByWorkspace,
  resolveWorkspaceColor,
}: {
  dayItems: CalendarChipItem[]
  groupChipsByWorkspace: boolean
  resolveWorkspaceColor?: (workspaceId: number) => string
}) {
  if (!groupChipsByWorkspace || !resolveWorkspaceColor) {
    return (
      <>
        {dayItems.map((item) => (
          <ScheduleChip key={calendarItemKey(item, item.workspaceId)} item={item} />
        ))}
      </>
    )
  }

  return (
    <>
      {groupItemsByWorkspace(dayItems).map(({ workspaceId, items }) => (
        <div
          key={workspaceId}
          className="space-y-0.5 rounded-md border p-0.5"
          style={
            workspaceId >= 0
              ? { borderColor: resolveWorkspaceColor(workspaceId) }
              : undefined
          }
        >
          {items.map((item) => (
            <ScheduleChip key={calendarItemKey(item, item.workspaceId)} item={item} />
          ))}
        </div>
      ))}
    </>
  )
}

function CalendarMonthGrid({
  days,
  selectedDay,
  todayIso,
  itemsForDay,
  onSelectDay,
  enableDaySelection = true,
  groupChipsByWorkspace = false,
  resolveWorkspaceColor,
}: {
  days: Array<{ date: Date | null; key: string }>
  selectedDay: string | null
  todayIso: string
  itemsForDay: (day: Date) => CalendarChipItem[]
  onSelectDay?: (dayIso: string) => void
  enableDaySelection?: boolean
  groupChipsByWorkspace?: boolean
  resolveWorkspaceColor?: (workspaceId: number) => string
}) {
  return (
    <>
      <div className="sticky top-0 z-10 mb-1 grid grid-cols-7 bg-card text-center text-[11px] font-medium text-muted-foreground md:mb-2 md:text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label.full} className="py-1.5 md:py-2">
            <span className="md:hidden">{label.short}</span>
            <span className="hidden md:inline">{label.full}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 items-stretch gap-px md:gap-2">
        {days.map(({ date: day, key }) => {
          const dayIso = day ? toIsoDate(day) : null
          const isSelected = dayIso !== null && dayIso === selectedDay
          const isToday = dayIso === todayIso

          if (!day) {
            return <div key={key} className="min-h-0" aria-hidden="true" />
          }

          const dayItems = itemsForDay(day)
          const chipListScrollable = dayItems.length > VISIBLE_CHIP_COUNT
          const dots = dayDotColors(dayItems)

          const dayCellClassName = cn(
            'flex h-full min-h-0 flex-col items-center justify-start rounded-md border p-1 text-left md:items-stretch md:rounded-lg md:p-2',
            enableDaySelection && 'transition-colors hover:bg-muted/40',
            isToday && 'border-primary bg-primary/5',
            enableDaySelection && isSelected && 'ring-2 ring-primary bg-primary/10',
          )

          const dayContent = (
            <>
              <div className="mb-1 shrink-0 text-xs font-medium leading-none md:mb-2 md:text-sm">{day.getDate()}</div>
              <div
                className={cn(
                  'hidden w-full shrink-0 space-y-1 md:block',
                  chipListScrollable && 'overflow-y-auto [scrollbar-gutter:stable]',
                )}
                style={{ height: CHIP_VIEWPORT_HEIGHT }}
                onWheel={chipListScrollable ? passWheelToScrollParent : undefined}
              >
                {dayItems.length === 0 ? null : (
                  <DayChipList
                    dayItems={dayItems}
                    groupChipsByWorkspace={groupChipsByWorkspace}
                    resolveWorkspaceColor={resolveWorkspaceColor}
                  />
                )}
              </div>
              <div className="mt-auto flex min-h-2 flex-wrap justify-center gap-0.5 md:hidden">
                {dots.map((color) => (
                  <span
                    key={color}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </>
          )

          if (!enableDaySelection) {
            return (
              <div key={key} className={dayCellClassName}>
                {dayContent}
              </div>
            )
          }

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay?.(dayIso!)}
              className={dayCellClassName}
            >
              {dayContent}
            </button>
          )
        })}
      </div>
    </>
  )
}

export function CalendarMonthCard({
  days,
  selectedDay,
  todayIso,
  itemsForDay,
  onSelectDay,
  focusFilter,
  showEventsFilter,
  showFinancesFilter,
  onToggleFocusFilter,
  headerActions,
  enableDaySelection = true,
  showFocusFilters = true,
  scrollContent = false,
  groupChipsByWorkspace = false,
  resolveWorkspaceColor,
}: {
  days: Array<{ date: Date | null; key: string }>
  selectedDay: string | null
  todayIso: string
  itemsForDay: (day: Date) => CalendarChipItem[]
  onSelectDay?: (dayIso: string) => void
  focusFilter: CalendarFocusFilter
  showEventsFilter: boolean
  showFinancesFilter: boolean
  onToggleFocusFilter: (area: keyof CalendarFocusFilter) => void
  headerActions?: ReactNode
  enableDaySelection?: boolean
  showFocusFilters?: boolean
  scrollContent?: boolean
  groupChipsByWorkspace?: boolean
  resolveWorkspaceColor?: (workspaceId: number) => string
}) {
  return (
    <Card className={cn(scrollContent && 'flex max-h-[46vh] min-h-0 flex-col overflow-hidden md:max-h-none md:flex-1')}>
      <CardHeader className={cn('space-y-3 pb-3', scrollContent && 'shrink-0')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CalendarLegend
            filter={focusFilter}
            showEvents={showEventsFilter}
            showFinances={showFinancesFilter}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {headerActions}
            {showFocusFilters ? (
              <CalendarFocusFilters
                filter={focusFilter}
                showEvents={showEventsFilter}
                showFinances={showFinancesFilter}
                onToggle={onToggleFocusFilter}
              />
            ) : null}
          </div>
        </div>
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
          enableDaySelection={enableDaySelection}
          groupChipsByWorkspace={groupChipsByWorkspace}
          resolveWorkspaceColor={resolveWorkspaceColor}
        />
      </CardContent>
    </Card>
  )
}
