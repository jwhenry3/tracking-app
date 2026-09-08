export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export type RecurrenceEndType = 'never' | 'count' | 'until'

export type RecurrencePreset =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'weekdays'
  | 'monthly_day'
  | 'monthly_weekday'
  | 'yearly'
  | 'custom'

export type MonthlyRepeatMode = 'day_of_month' | 'day_of_week'

export type RecurrenceConfig = {
  preset: RecurrencePreset
  frequency: RecurrenceFrequency
  interval: number
  weeklyDays: number[]
  monthlyMode: MonthlyRepeatMode
  monthlyWeekdayPosition: number
  endType: RecurrenceEndType
  count: number
  until: string
  /** Preserved when parsing rules the builder cannot fully round-trip. */
  sourceRule?: string
}

export const defaultRecurrenceConfig: RecurrenceConfig = {
  preset: 'none',
  frequency: 'none',
  interval: 1,
  weeklyDays: [],
  monthlyMode: 'day_of_month',
  monthlyWeekdayPosition: 1,
  endType: 'never',
  count: 13,
  until: '',
}

const weekdayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

type PresetOption = {
  id: RecurrencePreset
  label: string
}

export function parseAnchorDate(anchorDate: string) {
  const normalized = anchorDate.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? anchorDate.slice(0, 10)
  return new Date(`${normalized}T12:00:00`)
}

export function getRecurrencePresetOptions(anchorDate: string): PresetOption[] {
  const date = parseAnchorDate(anchorDate)
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' })
  const monthDay = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
  const dayOfMonth = date.getDate()
  const monthlyWeekday = describeMonthlyWeekdayLabel(date)

  return [
    { id: 'none', label: 'Does not repeat' },
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: `Weekly on ${weekday}` },
    { id: 'weekdays', label: 'Every weekday (Monday to Friday)' },
    { id: 'monthly_day', label: `Monthly on day ${dayOfMonth}` },
    { id: 'monthly_weekday', label: `Monthly on the ${monthlyWeekday}` },
    { id: 'yearly', label: `Annually on ${monthDay}` },
    { id: 'custom', label: 'Custom...' },
  ]
}

export function applyRecurrencePreset(
  preset: RecurrencePreset,
  anchorDate: string,
  current: RecurrenceConfig = defaultRecurrenceConfig,
): RecurrenceConfig {
  if (preset === 'none') {
    return { ...defaultRecurrenceConfig, preset: 'none', frequency: 'none' }
  }

  const date = parseAnchorDate(anchorDate)
  const weekday = date.getDay()
  const position = getWeekdayPositionInMonth(date)

  const base = {
    ...current,
    preset,
    endType: current.endType,
    count: current.count,
    until: current.until || anchorDate,
  }

  switch (preset) {
    case 'daily':
      return { ...base, frequency: 'daily', interval: 1, weeklyDays: [], monthlyMode: 'day_of_month' }
    case 'weekly':
      return { ...base, frequency: 'weekly', interval: 1, weeklyDays: [weekday], monthlyMode: 'day_of_month' }
    case 'weekdays':
      return { ...base, frequency: 'weekly', interval: 1, weeklyDays: [1, 2, 3, 4, 5], monthlyMode: 'day_of_month' }
    case 'monthly_day':
      return { ...base, frequency: 'monthly', interval: 1, weeklyDays: [], monthlyMode: 'day_of_month' }
    case 'monthly_weekday':
      return {
        ...base,
        frequency: 'monthly',
        interval: 1,
        weeklyDays: [weekday],
        monthlyMode: 'day_of_week',
        monthlyWeekdayPosition: position,
      }
    case 'yearly':
      return { ...base, frequency: 'yearly', interval: 1, weeklyDays: [], monthlyMode: 'day_of_month' }
    case 'custom':
      return {
        ...base,
        frequency: current.frequency === 'none' ? 'weekly' : current.frequency,
        interval: Math.max(1, current.interval),
        weeklyDays: current.weeklyDays.length > 0 ? current.weeklyDays : [weekday],
      }
    default:
      return { ...defaultRecurrenceConfig }
  }
}

export function buildRecurrenceRule(config: RecurrenceConfig, anchorDate: string): string {
  if (config.preset === 'none' || config.frequency === 'none') {
    return ''
  }

  if (config.sourceRule && shouldPreserveSourceRule(config)) {
    return applyEndToRule(config.sourceRule, config)
  }

  const parts: string[] = []
  const frequency = config.preset === 'weekdays' ? 'WEEKLY' : config.frequency.toUpperCase()
  parts.push(`FREQ=${frequency}`)

  const interval = config.preset === 'weekdays' ? 1 : Math.max(1, config.interval)
  if (interval > 1) {
    parts.push(`INTERVAL=${interval}`)
  }

  if (frequency === 'WEEKLY') {
    const days = config.preset === 'weekdays'
      ? [1, 2, 3, 4, 5]
      : config.weeklyDays.length > 0
        ? config.weeklyDays
        : [parseAnchorDate(anchorDate).getDay()]
    parts.push(`BYDAY=${days.map((day) => weekdayCodes[day]).join(',')}`)
  }

  if (frequency === 'MONTHLY') {
    if (config.preset === 'monthly_weekday' || config.monthlyMode === 'day_of_week') {
      const date = parseAnchorDate(anchorDate)
      const weekday = date.getDay()
      const position = config.preset === 'monthly_weekday'
        ? getWeekdayPositionInMonth(date)
        : config.monthlyWeekdayPosition
      parts.push(`BYDAY=${position}${weekdayCodes[weekday]}`)
    } else {
      parts.push(`BYMONTHDAY=${parseAnchorDate(anchorDate).getDate()}`)
    }
  }

  if (config.endType === 'count' && config.count > 0) {
    parts.push(`COUNT=${config.count}`)
  }

  if (config.endType === 'until' && config.until) {
    parts.push(`UNTIL=${config.until.replace(/-/g, '')}T235959Z`)
  }

  return parts.join(';')
}

export function parseRecurrenceRule(rule: string, anchorDate: string): RecurrenceConfig {
  if (!rule || rule === 'none') {
    return { ...defaultRecurrenceConfig }
  }

  if (rule.includes('X-ADJUST-WEEKEND=PREVIOUS') && rule.includes('BYMONTHDAY=15,-1')) {
    return {
      ...defaultRecurrenceConfig,
      preset: 'custom',
      frequency: 'monthly',
      interval: 1,
      monthlyMode: 'day_of_month',
      endType: 'never',
      sourceRule: rule,
    }
  }

  const parts = parseRuleParts(rule)
  const freq = (parts.FREQ ?? '').toLowerCase() as RecurrenceFrequency
  const interval = Number(parts.INTERVAL ?? 1)
  const endType: RecurrenceEndType = parts.COUNT ? 'count' : parts.UNTIL ? 'until' : 'never'
  const count = Number(parts.COUNT ?? 13)
  const until = parts.UNTIL ? parseUntilDate(parts.UNTIL) : anchorDate

  let weeklyDays: number[] = []
  if (parts.BYDAY && freq === 'weekly') {
    weeklyDays = parts.BYDAY.split(',').map((token) => {
      const code = token.length > 2 ? token.slice(-2) : token
      return weekdayCodes.indexOf(code as typeof weekdayCodes[number])
    }).filter((day) => day >= 0)
  }

  let monthlyMode: MonthlyRepeatMode = 'day_of_month'
  let monthlyWeekdayPosition = 1
  if (freq === 'monthly' && parts.BYDAY && !parts.BYMONTHDAY) {
    monthlyMode = 'day_of_week'
    const token = parts.BYDAY.split(',')[0]
    monthlyWeekdayPosition = parseInt(token, 10)
    const weekdayCode = token.replace(/-?\d+/g, '')
    const weekday = weekdayCodes.indexOf(weekdayCode as typeof weekdayCodes[number])
    if (weekday >= 0) weeklyDays = [weekday]
  }

  const config: RecurrenceConfig = {
    preset: 'custom',
    frequency: freq || 'weekly',
    interval,
    weeklyDays,
    monthlyMode,
    monthlyWeekdayPosition,
    endType,
    count,
    until,
  }

  config.preset = detectPreset(config, anchorDate, parts)
  if (config.preset === 'custom') {
    config.sourceRule = rule
  }
  return config
}

export function describeRecurrence(rule: string, anchorDate?: string): string {
  if (!rule || rule === 'none') {
    return 'Does not repeat'
  }

  if (rule.includes('X-ADJUST-WEEKEND=PREVIOUS') && rule.includes('BYMONTHDAY=15,-1')) {
    return 'Twice monthly on the 15th and last day (moved to previous weekday if weekend)'
  }

  const anchor = anchorDate ?? new Date().toISOString().slice(0, 10)
  const config = parseRecurrenceRule(rule, anchor)
  const presetLabel = getRecurrencePresetOptions(anchor).find((option) => option.id === config.preset)?.label

  if (config.preset !== 'custom' && presetLabel) {
    return appendEndDescription(presetLabel, config)
  }

  const parts = parseRuleParts(rule)
  const freq = (parts.FREQ ?? '').toLowerCase()
  const interval = Number(parts.INTERVAL ?? 1)

  if (freq === 'daily') {
    return appendEndDescription(interval > 1 ? `Every ${interval} days` : 'Daily', config)
  }

  if (freq === 'weekly') {
    const days = (parts.BYDAY ?? '')
      .split(',')
      .map((token) => weekdayLabels[weekdayCodes.indexOf(token.slice(-2) as typeof weekdayCodes[number])])
      .filter(Boolean)
    if (days.length === 5 && ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].every((day) => days.includes(day as typeof weekdayLabels[number]))) {
      return appendEndDescription('Every weekday (Monday to Friday)', config)
    }
    const weeklyLabel = interval > 1 ? `Every ${interval} weeks` : 'Weekly'
    return appendEndDescription(days.length ? `${weeklyLabel} on ${days.join(', ')}` : weeklyLabel, config)
  }

  if (freq === 'monthly') {
    if (parts.BYMONTHDAY) {
      return appendEndDescription(`Monthly on day ${parts.BYMONTHDAY}`, config)
    }
    if (parts.BYDAY) {
      const date = parseAnchorDate(anchor)
      return appendEndDescription(`Monthly on the ${describeMonthlyWeekdayLabel(date)}`, config)
    }
    return appendEndDescription(interval > 1 ? `Every ${interval} months` : 'Monthly', config)
  }

  if (freq === 'yearly') {
    const date = parseAnchorDate(anchor)
    const label = interval > 1
      ? `Every ${interval} years on ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`
      : `Annually on ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`
    return appendEndDescription(label, config)
  }

  return rule
}

export function parseOccurrenceId(occurrenceId: string) {
  const separator = occurrenceId.indexOf(':')
  if (separator === -1) {
    return { seriesId: Number(occurrenceId), occurrenceAt: '' }
  }
  return {
    seriesId: Number(occurrenceId.slice(0, separator)),
    occurrenceAt: occurrenceId.slice(separator + 1),
  }
}

export type OccurrenceScope = 'this' | 'following' | 'all'

function parseRuleParts(rule: string) {
  return Object.fromEntries(
    rule.split(';').map((part) => {
      const [key, ...rest] = part.split('=')
      return [key.toUpperCase(), rest.join('=')]
    }),
  )
}

function parseUntilDate(until: string) {
  if (until.length >= 8) {
    return `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`
  }
  return until
}

function getWeekdayPositionInMonth(date: Date) {
  const weekday = date.getDay()
  const day = date.getDate()
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()

  let nth = 0
  for (let d = 1; d <= day; d += 1) {
    if (new Date(date.getFullYear(), date.getMonth(), d).getDay() === weekday) {
      nth += 1
    }
  }

  let remaining = 0
  for (let d = day; d <= lastDay; d += 1) {
    if (new Date(date.getFullYear(), date.getMonth(), d).getDay() === weekday) {
      remaining += 1
    }
  }

  return remaining === 1 ? -1 : nth
}

function describeMonthlyWeekdayLabel(date: Date) {
  const position = getWeekdayPositionInMonth(date)
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' })
  if (position === -1) {
    return `last ${weekday}`
  }
  const ordinals = ['first', 'second', 'third', 'fourth', 'fifth']
  return `${ordinals[position - 1] ?? `${position}th`} ${weekday}`
}

function detectPreset(
  config: RecurrenceConfig,
  _anchorDate: string,
  parts: Record<string, string>,
): RecurrencePreset {
  if (config.frequency === 'daily' && config.interval === 1 && config.endType === 'never') {
    return 'daily'
  }

  if (config.frequency === 'yearly' && config.interval === 1 && config.endType === 'never') {
    return 'yearly'
  }

  if (config.frequency === 'weekly' && config.interval === 1) {
    const weekdays = [1, 2, 3, 4, 5]
    if (config.weeklyDays.length === 5 && weekdays.every((day, index) => config.weeklyDays[index] === day)) {
      return 'weekdays'
    }
    if (config.weeklyDays.length === 1) {
      return 'weekly'
    }
  }

  if (config.frequency === 'monthly' && config.interval === 1) {
    if (parts.BYMONTHDAY && !parts.BYMONTHDAY.includes(',')) {
      return 'monthly_day'
    }
    if (parts.BYDAY && config.monthlyMode === 'day_of_week') {
      return 'monthly_weekday'
    }
    if (!parts.BYMONTHDAY && !parts.BYDAY) {
      return 'monthly_day'
    }
  }

  return 'custom'
}

function shouldPreserveSourceRule(config: RecurrenceConfig) {
  return config.preset === 'custom' && config.endType === 'never'
}

function applyEndToRule(rule: string, config: RecurrenceConfig) {
  if (config.endType === 'never') {
    return rule.replace(/;COUNT=\d+/i, '').replace(/;UNTIL=[^;]+/i, '')
  }
  let next = rule.replace(/;COUNT=\d+/i, '').replace(/;UNTIL=[^;]+/i, '')
  if (config.endType === 'count') {
    next += `;COUNT=${config.count}`
  }
  if (config.endType === 'until' && config.until) {
    next += `;UNTIL=${config.until.replace(/-/g, '')}T235959Z`
  }
  return next
}

function appendEndDescription(label: string, config: RecurrenceConfig) {
  if (config.endType === 'count') {
    return `${label}, ${config.count} times`
  }
  if (config.endType === 'until' && config.until) {
    return `${label}, until ${config.until}`
  }
  return label
}

export { weekdayCodes, weekdayLabels }
