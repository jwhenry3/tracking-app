import { normalizeFinanceDate } from '@/lib/financeUtils'

export type EventTimeRangeState = {
  useTimeRange: boolean
  startTime: string
  endTime: string
}

export const DEFAULT_EVENT_START_TIME = '09:00'
export const DEFAULT_EVENT_END_TIME = '10:00'

export function defaultEventTimeRangeState(): EventTimeRangeState {
  return {
    useTimeRange: false,
    startTime: DEFAULT_EVENT_START_TIME,
    endTime: DEFAULT_EVENT_END_TIME,
  }
}

function formatLocalTimeInput(iso: string) {
  const date = new Date(iso)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function parseLocalDate(date: string) {
  const normalized = normalizeFinanceDate(date) ?? date
  return new Date(`${normalized}T12:00:00`)
}

function localDateTimeToIso(date: string, time: string) {
  const [hours, minutes] = time.split(':').map((part) => Number(part))
  const local = parseLocalDate(date)
  local.setHours(hours, minutes, 0, 0)
  return local.toISOString()
}

export function eventTimeRangeFromPlannerEvent(event: {
  start_at: string
  end_at: string
  all_day: boolean
}): EventTimeRangeState {
  if (event.all_day) {
    return defaultEventTimeRangeState()
  }

  return {
    useTimeRange: true,
    startTime: formatLocalTimeInput(event.start_at),
    endTime: formatLocalTimeInput(event.end_at),
  }
}

export function buildEventSchedule(date: string, timeRange: EventTimeRangeState) {
  const normalized = normalizeFinanceDate(date) ?? date

  if (!timeRange.useTimeRange) {
    const dayStart = parseLocalDate(normalized)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = parseLocalDate(normalized)
    dayEnd.setHours(23, 59, 59, 999)
    return {
      start_at: dayStart.toISOString(),
      end_at: dayEnd.toISOString(),
      all_day: true,
    }
  }

  const start_at = localDateTimeToIso(
    normalized,
    timeRange.startTime || DEFAULT_EVENT_START_TIME,
  )
  let end_at = localDateTimeToIso(normalized, timeRange.endTime || DEFAULT_EVENT_END_TIME)
  if (new Date(end_at) <= new Date(start_at)) {
    end_at = new Date(new Date(start_at).getTime() + 60 * 60 * 1000).toISOString()
  }

  return { start_at, end_at, all_day: false }
}
