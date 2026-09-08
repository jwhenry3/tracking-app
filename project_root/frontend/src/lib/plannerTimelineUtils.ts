import type { PlannerScheduleItem } from '@/components/planner/PlannerScheduleRow'
import type { PlannerEvent } from '@/lib/types'

export const TIMELINE_START_HOUR = 6
export const TIMELINE_END_HOUR = 22
export const TIMELINE_HOUR_HEIGHT = 56
export const TIMELINE_TOTAL_MINUTES = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60
export const TIMELINE_TOTAL_HEIGHT = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * TIMELINE_HOUR_HEIGHT

export function isPlannerEvent(item: PlannerScheduleItem): item is PlannerEvent {
  return !('kind' in item)
}

export function partitionDaySchedule(items: PlannerScheduleItem[]) {
  const allDay: PlannerScheduleItem[] = []
  const timed: PlannerEvent[] = []

  for (const item of items) {
    if (isPlannerEvent(item)) {
      if (item.all_day) {
        allDay.push(item)
      } else {
        timed.push(item)
      }
      continue
    }
    allDay.push(item)
  }

  timed.sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  )

  return { allDay, timed }
}

export function timelineHours() {
  return Array.from(
    { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
    (_, index) => TIMELINE_START_HOUR + index,
  )
}

export function formatTimelineHour(hour: number) {
  const date = new Date()
  date.setHours(hour, 0, 0, 0)
  return date.toLocaleTimeString(undefined, { hour: 'numeric' })
}

function minutesSinceMidnight(iso: string) {
  const date = new Date(iso)
  return date.getHours() * 60 + date.getMinutes()
}

export function formatEventTimeRange(event: PlannerEvent) {
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${formatter.format(start)} – ${formatter.format(end)}`
}

export type TimelineEventBlock = {
  event: PlannerEvent
  top: number
  height: number
}

export function buildTimelineEventBlocks(events: PlannerEvent[]): TimelineEventBlock[] {
  const dayStart = TIMELINE_START_HOUR * 60
  const dayEnd = TIMELINE_END_HOUR * 60
  const blocks: TimelineEventBlock[] = []

  for (const event of events) {
    const startMin = minutesSinceMidnight(event.start_at)
    const endMin = Math.max(startMin + 15, minutesSinceMidnight(event.end_at))
    const clampedStart = Math.max(startMin, dayStart)
    const clampedEnd = Math.min(endMin, dayEnd)
    if (clampedEnd <= clampedStart) continue

    const top = ((clampedStart - dayStart) / TIMELINE_TOTAL_MINUTES) * TIMELINE_TOTAL_HEIGHT
    const height = Math.max(
      28,
      ((clampedEnd - clampedStart) / TIMELINE_TOTAL_MINUTES) * TIMELINE_TOTAL_HEIGHT,
    )

    blocks.push({ event, top, height })
  }

  return blocks
}
