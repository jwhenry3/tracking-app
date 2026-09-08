import { ScheduleChip } from '@/components/planner/ScheduleChip'
import { CheckListChip, type WeekCheckListItem } from '@/components/planner/CheckListChip'
import type { PlannerScheduleItem } from '@/components/planner/PlannerScheduleRow'
import { Card, CardContent } from '@/components/ui/card'
import {
  buildTimelineEventBlocks,
  formatEventTimeRange,
  formatTimelineHour,
  partitionDaySchedule,
  TIMELINE_HOUR_HEIGHT,
  TIMELINE_TOTAL_HEIGHT,
  timelineHours,
} from '@/lib/plannerTimelineUtils'
import { scheduleChipColors } from '@/lib/scheduleChipStyles'
import type { PlannerEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

const GRID_COLUMNS = 'grid-cols-[3rem_repeat(7,minmax(5.5rem,1fr))]'

type WeeklyPlannerWeekViewProps = {
  days: string[]
  scheduleByDay: Map<string, PlannerScheduleItem[]>
  checkListsByDay: Map<string, WeekCheckListItem[]>
  selectedDay: string | null
  todayIso: string
  onSelectDay: (day: string) => void
  onOpenScheduleItem: (item: PlannerScheduleItem) => void
  onOpenCheckList: (item: WeekCheckListItem) => void
}

function formatColumnHeader(day: string) {
  const date = new Date(`${day}T12:00:00`)
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
    dayNumber: date.getDate(),
  }
}

function scheduleItemKey(item: PlannerScheduleItem) {
  return 'occurrence_id' in item ? item.occurrence_id : `${item.kind}-${item.id}`
}

function columnBackgroundClass(isSelected: boolean, isToday: boolean) {
  return cn(
    'transition-colors',
    isSelected && 'bg-primary/10',
    !isSelected && isToday && 'bg-primary/5',
  )
}

function TimedEventBlock({
  event,
  top,
  height,
  onOpen,
}: {
  event: PlannerEvent
  top: number
  height: number
  onOpen: () => void
}) {
  const color = event.color || scheduleChipColors.event

  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation()
        onOpen()
      }}
      className="absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] shadow-sm transition hover:brightness-95"
      style={{
        top,
        height,
        borderColor: color,
        backgroundColor: `${color}22`,
      }}
    >
      <p className="truncate font-medium leading-tight">{event.title}</p>
      {height >= 40 ? (
        <p className="truncate text-[10px] text-muted-foreground">{formatEventTimeRange(event)}</p>
      ) : null}
    </button>
  )
}

export function WeeklyPlannerWeekView({
  days,
  scheduleByDay,
  checkListsByDay,
  selectedDay,
  todayIso,
  onSelectDay,
  onOpenScheduleItem,
  onOpenCheckList,
}: WeeklyPlannerWeekViewProps) {
  const hours = timelineHours()

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
          <div className="flex min-h-0 min-w-[720px] flex-1 flex-col">
            <div className={cn('grid shrink-0 border-b bg-card', GRID_COLUMNS)}>
              <div className="border-r" />
              {days.map((day) => {
                const { weekday, dayNumber } = formatColumnHeader(day)
                const isSelected = selectedDay === day
                const isToday = day === todayIso

                return (
                  <button
                    key={`${day}-header`}
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className={cn('border-r px-2 py-2 text-center last:border-r-0', columnBackgroundClass(isSelected, isToday))}
                  >
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{weekday}</p>
                    <p className={cn('text-sm font-semibold leading-tight', isToday && 'text-primary')}>{dayNumber}</p>
                  </button>
                )
              })}
            </div>

            <div className={cn('grid shrink-0 border-b bg-card', GRID_COLUMNS)}>
              <div className="flex items-start border-r px-1 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  All day
                </span>
              </div>
              {days.map((day) => {
                const dayItems = scheduleByDay.get(day) ?? []
                const { allDay } = partitionDaySchedule(dayItems)
                const checkLists = checkListsByDay.get(day) ?? []
                const isSelected = selectedDay === day
                const isToday = day === todayIso

                return (
                  <div
                    key={`${day}-all-day`}
                    className={cn(
                      'space-y-1 border-r p-1.5 last:border-r-0',
                      columnBackgroundClass(isSelected, isToday),
                    )}
                  >
                    {allDay.map((item) => (
                      <button
                        key={scheduleItemKey(item)}
                        type="button"
                        className="block w-full text-left"
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenScheduleItem(item)
                        }}
                      >
                        <ScheduleChip item={item} />
                      </button>
                    ))}
                    {checkLists.map((list) => (
                      <CheckListChip
                        key={`${list.day}-${list.listId}`}
                        item={list}
                        onClick={() => onOpenCheckList(list)}
                      />
                    ))}
                    {allDay.length === 0 && checkLists.length === 0 ? (
                      <p className="py-1 text-center text-[10px] text-muted-foreground">—</p>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
              <div className={cn('relative grid', GRID_COLUMNS)} style={{ height: TIMELINE_TOTAL_HEIGHT }}>
                <div className="relative border-r">
                  {hours.map((hour, index) => (
                    <div
                      key={hour}
                      className="absolute right-0 left-0 border-t border-border/70"
                      style={{ top: index * TIMELINE_HOUR_HEIGHT }}
                    >
                      {index === 0 ? null : (
                        <span className="absolute -top-2 right-1 text-[10px] text-muted-foreground">
                          {formatTimelineHour(hour)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {days.map((day) => {
                  const dayItems = scheduleByDay.get(day) ?? []
                  const { timed } = partitionDaySchedule(dayItems)
                  const eventBlocks = buildTimelineEventBlocks(timed)
                  const isSelected = selectedDay === day
                  const isToday = day === todayIso

                  return (
                    <div
                      key={`${day}-timeline`}
                      className={cn('relative border-r last:border-r-0', columnBackgroundClass(isSelected, isToday))}
                    >
                      {hours.map((hour, index) => (
                        <div
                          key={`${day}-${hour}`}
                          className="pointer-events-none absolute inset-x-0 border-t border-border/50"
                          style={{ top: index * TIMELINE_HOUR_HEIGHT }}
                        />
                      ))}
                      {eventBlocks.map(({ event, top, height }) => (
                        <TimedEventBlock
                          key={event.occurrence_id}
                          event={event}
                          top={top}
                          height={height}
                          onOpen={() => onOpenScheduleItem(event)}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
