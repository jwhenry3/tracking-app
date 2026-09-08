type PlannerCheckListPrefs = {
  showAll: boolean
  hiddenDays: string[]
}

export type { PlannerCheckListPrefs }

function storageKey(workspaceId: number, mode: string) {
  return `planner-checklists:${workspaceId}:${mode}`
}

export function loadPlannerCheckListPrefs(workspaceId: number, mode: string): PlannerCheckListPrefs {
  if (typeof window === 'undefined') {
    return { showAll: true, hiddenDays: [] }
  }

  try {
    const raw = localStorage.getItem(storageKey(workspaceId, mode))
    if (!raw) return { showAll: true, hiddenDays: [] }
    const parsed = JSON.parse(raw) as Partial<PlannerCheckListPrefs>
    return {
      showAll: parsed.showAll ?? true,
      hiddenDays: Array.isArray(parsed.hiddenDays) ? parsed.hiddenDays : [],
    }
  } catch {
    return { showAll: true, hiddenDays: [] }
  }
}

export function savePlannerCheckListPrefs(workspaceId: number, mode: string, prefs: PlannerCheckListPrefs) {
  localStorage.setItem(storageKey(workspaceId, mode), JSON.stringify(prefs))
}

export function isCheckListDayVisible(prefs: PlannerCheckListPrefs, day: string) {
  return prefs.showAll && !prefs.hiddenDays.includes(day)
}

export function toggleCheckListDay(prefs: PlannerCheckListPrefs, day: string): PlannerCheckListPrefs {
  const hiddenDays = prefs.hiddenDays.includes(day)
    ? prefs.hiddenDays.filter((value) => value !== day)
    : [...prefs.hiddenDays, day]

  return { ...prefs, hiddenDays }
}

export function toggleAllCheckLists(prefs: PlannerCheckListPrefs): PlannerCheckListPrefs {
  return { ...prefs, showAll: !prefs.showAll }
}
