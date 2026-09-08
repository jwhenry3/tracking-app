export type CalendarFocusFilter = {
  events: boolean
  finances: boolean
}

const CENTRAL_STORAGE_KEY = 'central-calendar-focus-filter'

function storageKey(workspaceId: number) {
  return `calendar-focus-filter:${workspaceId}`
}

export function defaultCalendarFocusFilter(): CalendarFocusFilter {
  return { events: true, finances: true }
}

export function loadCalendarFocusFilter(workspaceId: number): CalendarFocusFilter {
  if (typeof window === 'undefined') {
    return defaultCalendarFocusFilter()
  }

  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    if (!raw) return defaultCalendarFocusFilter()
    const parsed = JSON.parse(raw) as Partial<CalendarFocusFilter>
    return {
      events: parsed.events ?? true,
      finances: parsed.finances ?? true,
    }
  } catch {
    return defaultCalendarFocusFilter()
  }
}

export function saveCalendarFocusFilter(workspaceId: number, filter: CalendarFocusFilter) {
  localStorage.setItem(storageKey(workspaceId), JSON.stringify(filter))
}

export function toggleCalendarFocusFilter(
  filter: CalendarFocusFilter,
  area: keyof CalendarFocusFilter,
): CalendarFocusFilter {
  const next = { ...filter, [area]: !filter[area] }
  if (!next.events && !next.finances) {
    return filter
  }
  return next
}

export function loadCentralCalendarFocusFilter(): CalendarFocusFilter {
  if (typeof window === 'undefined') {
    return defaultCalendarFocusFilter()
  }

  try {
    const raw = localStorage.getItem(CENTRAL_STORAGE_KEY)
    if (!raw) return defaultCalendarFocusFilter()
    const parsed = JSON.parse(raw) as Partial<CalendarFocusFilter>
    return {
      events: parsed.events ?? true,
      finances: parsed.finances ?? true,
    }
  } catch {
    return defaultCalendarFocusFilter()
  }
}

export function saveCentralCalendarFocusFilter(filter: CalendarFocusFilter) {
  localStorage.setItem(CENTRAL_STORAGE_KEY, JSON.stringify(filter))
}
