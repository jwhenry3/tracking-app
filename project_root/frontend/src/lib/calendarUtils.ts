import type { CalendarFocusFilter } from '@/lib/calendarFocusFilter'
import type { CalendarItem } from '@/lib/calendarTypes'
import { calendarLegendColors } from '@/lib/scheduleChipStyles'
import type { PlannerScheduleItem } from '@/components/planner/PlannerScheduleRow'

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59)
}

export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function isInRange(iso: string, start: string, end: string) {
  const day = iso.slice(0, 10)
  return day >= start.slice(0, 10) && day <= end.slice(0, 10)
}

export function calendarItemKey(item: CalendarItem, workspaceId?: number) {
  const prefix = workspaceId !== undefined ? `${workspaceId}-` : ''
  if (item.kind === 'expense') return `${prefix}expense-${item.id}`
  return `${prefix}${item.kind}-${item.occurrence_id}`
}

export function formatDayToggleLabel(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export const VISIBLE_CHIP_COUNT = 5
export const CHIP_VIEWPORT_HEIGHT = `calc(${VISIBLE_CHIP_COUNT} * 1.375rem + ${VISIBLE_CHIP_COUNT - 1} * 0.25rem)`

export const WEEKDAY_LABELS = [
  { short: 'Su', full: 'Sun' },
  { short: 'Mo', full: 'Mon' },
  { short: 'Tu', full: 'Tue' },
  { short: 'We', full: 'Wed' },
  { short: 'Th', full: 'Thu' },
  { short: 'Fr', full: 'Fri' },
  { short: 'Sa', full: 'Sat' },
]

export function calendarItemDotColor(item: CalendarItem) {
  if (item.kind === 'event') return calendarLegendColors.event
  if (item.kind === 'income') return calendarLegendColors.income
  if (item.kind === 'expense') return calendarLegendColors.expense
  if (item.paid) return calendarLegendColors.billPaid
  if (item.skipped) return calendarLegendColors.billSkipped
  return calendarLegendColors.billDue
}

export function dayDotColors(items: CalendarItem[]) {
  const colors: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const color = calendarItemDotColor(item)
    if (seen.has(color)) continue
    seen.add(color)
    colors.push(color)
    if (colors.length >= 4) break
  }
  return colors
}

export function matchesCalendarItem(item: CalendarItem, filter: CalendarFocusFilter) {
  if (item.kind === 'event') return filter.events
  return filter.finances
}

export function matchesScheduleItem(item: PlannerScheduleItem, filter: CalendarFocusFilter) {
  if (!('kind' in item)) return filter.events
  return filter.finances
}

export function buildMonthDays(cursor: Date) {
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
}

export function workspaceInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
