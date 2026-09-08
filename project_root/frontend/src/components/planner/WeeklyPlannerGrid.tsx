import { ScheduleChip, type ScheduleChipItem } from '@/components/planner/ScheduleChip'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const VISIBLE_CHIP_COUNT = 5
const CHIP_VIEWPORT_HEIGHT = `calc(${VISIBLE_CHIP_COUNT} * 1.375rem + ${VISIBLE_CHIP_COUNT - 1} * 0.25rem)`
const WEEK_GRID_HEIGHT = `calc(3rem + 0.375rem + ${CHIP_VIEWPORT_HEIGHT} + 0.5rem)`

type WeeklyPlannerGridProps = {
  days: string[]
  scheduleByDay: Map<string, ScheduleChipItem[]>
  selectedDay: string | null
  todayIso: string
  onSelectDay: (day: string) => void
}

function formatColumnHeader(day: string) {
  const date = new Date(`${day}T12:00:00`)
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
    dayNumber: date.getDate(),
  }
}

function columnBackgroundClass(isSelected: boolean, isToday: boolean) {
  return cn(
    'transition-colors',
    isSelected && 'bg-primary/12',
    !isSelected && isToday && 'bg-primary/6',
    !isSelected && !isToday && 'bg-muted/45 hover:bg-muted/60',
  )
}

export function WeeklyPlannerGrid({
  days,
  scheduleByDay,
  selectedDay,
  todayIso,
  onSelectDay,
}: WeeklyPlannerGridProps) {
  return (
    <Card className="min-w-0 shrink-0 overflow-hidden">
      <CardContent className="p-2">
        <div className="overflow-x-auto">
          <div
            className="min-w-[640px] overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]"
            style={{ maxHeight: WEEK_GRID_HEIGHT }}
          >
            <div className="sticky top-0 z-10 mb-1.5 grid grid-cols-7 gap-1.5 bg-card pb-1.5">
            {days.map((day) => {
              const { weekday, dayNumber } = formatColumnHeader(day)
              const isSelected = selectedDay === day
              const isToday = day === todayIso

              return (
                <button
                  key={`${day}-header`}
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className={cn('p-2 text-center', columnBackgroundClass(isSelected, isToday))}
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{weekday}</p>
                  <p className={cn('text-sm font-semibold leading-tight', isToday && 'text-primary')}>{dayNumber}</p>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-7 gap-1.5 items-stretch pb-2">
            {days.map((day) => {
              const dayItems = scheduleByDay.get(day) ?? []
              const isSelected = selectedDay === day
              const isToday = day === todayIso

              return (
                <button
                  key={`${day}-body`}
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className={cn(
                    'flex h-full min-h-full w-full flex-col p-2 text-left',
                    columnBackgroundClass(isSelected, isToday),
                  )}
                  style={{ minHeight: CHIP_VIEWPORT_HEIGHT }}
                >
                  <div className="min-h-0 flex-1 space-y-1">
                    {dayItems.length === 0 ? (
                      <p className="text-center text-[10px] text-muted-foreground">—</p>
                    ) : (
                      dayItems.map((item) => (
                        <ScheduleChip
                          key={'occurrence_id' in item ? item.occurrence_id : `${'kind' in item ? item.kind : 'event'}-${item.id}`}
                          item={item}
                        />
                      ))
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        </div>
      </CardContent>
    </Card>
  )
}
