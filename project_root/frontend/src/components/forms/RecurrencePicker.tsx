import { FormField } from '@/components/forms/FormField'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { RecurrenceConfig, RecurrenceFrequency, RecurrencePreset } from '@/lib/recurrence'
import {
  applyRecurrencePreset,
  buildRecurrenceRule,
  defaultRecurrenceConfig,
  describeRecurrence,
  getRecurrencePresetOptions,
  weekdayLabels,
} from '@/lib/recurrence'

type RecurrencePickerProps = {
  value: RecurrenceConfig
  anchorDate: string
  onChange: (value: RecurrenceConfig) => void
  readOnly?: boolean
  seriesRule?: string
}

const frequencyOptions: Array<{ id: RecurrenceFrequency; label: string }> = [
  { id: 'daily', label: 'day' },
  { id: 'weekly', label: 'week' },
  { id: 'monthly', label: 'month' },
  { id: 'yearly', label: 'year' },
]

export function RecurrencePicker({ value, anchorDate, onChange, readOnly = false, seriesRule = '' }: RecurrencePickerProps) {
  const presets = getRecurrencePresetOptions(anchorDate)
  const effectiveRule = seriesRule || value.sourceRule || buildRecurrenceRule(value, anchorDate)
  const summary = effectiveRule
    ? describeRecurrence(effectiveRule, anchorDate)
    : 'Does not repeat'

  function updatePreset(preset: RecurrencePreset) {
    if (readOnly) return
    onChange(applyRecurrencePreset(preset, anchorDate, { ...value, sourceRule: undefined }))
  }

  if (readOnly) {
    if (!effectiveRule) return null
    return (
      <div className="space-y-2 rounded-lg border p-3">
        <Label>Repeat</Label>
        <p className="text-sm">{summary}</p>
        <p className="text-xs text-muted-foreground">
          Choose &quot;All events&quot; or &quot;This and following events&quot; above to edit the recurrence schedule.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-2">
        <Label>Repeat</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={value.preset}
          onChange={(event) => updatePreset(event.target.value as RecurrencePreset)}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>
        {value.preset !== 'none' ? (
          <p className="text-xs text-muted-foreground">{summary}</p>
        ) : null}
      </div>

      {value.preset === 'custom' ? (
        <>
          <div className="grid grid-cols-[72px_1fr_1fr] items-end gap-2">
            <span className="pb-2 text-sm text-muted-foreground">Repeat every</span>
            <FormField
              label=""
              type="number"
              value={String(value.interval)}
              onChange={(next) => onChange({ ...value, interval: Math.max(1, Number(next) || 1) })}
              id="recurrence-interval"
            />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={value.frequency === 'none' ? 'weekly' : value.frequency}
              onChange={(event) =>
                onChange({
                  ...value,
                  frequency: event.target.value as RecurrenceFrequency,
                })
              }
            >
              {frequencyOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>

          {value.frequency === 'weekly' ? (
            <div className="space-y-2">
              <Label>Repeat on</Label>
              <div className="flex flex-wrap gap-2">
                {weekdayLabels.map((label, index) => {
                  const selected = value.weeklyDays.includes(index)
                  return (
                    <button
                      key={label}
                      type="button"
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full border text-xs font-medium',
                        selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background',
                      )}
                      aria-label={label}
                      onClick={() => {
                        const weeklyDays = selected
                          ? value.weeklyDays.filter((day) => day !== index)
                          : [...value.weeklyDays, index].sort((a, b) => a - b)
                        onChange({ ...value, weeklyDays: weeklyDays.length ? weeklyDays : [index] })
                      }}
                    >
                      {label.slice(0, 1)}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {value.frequency === 'monthly' ? (
            <div className="space-y-2">
              <Label>Monthly repeat</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={value.monthlyMode}
                onChange={(event) =>
                  onChange({
                    ...value,
                    monthlyMode: event.target.value as RecurrenceConfig['monthlyMode'],
                  })
                }
              >
                <option value="day_of_month">On day {new Date(`${anchorDate}T12:00:00`).getDate()}</option>
                <option value="day_of_week">
                  On the {describeMonthlyWeekdayOption(anchorDate)}
                </option>
              </select>
            </div>
          ) : null}
        </>
      ) : null}

      {value.preset !== 'none' ? (
        <div className="space-y-2 border-t pt-3">
          <Label>Ends</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={value.endType}
            onChange={(event) =>
              onChange({
                ...value,
                endType: event.target.value as RecurrenceConfig['endType'],
              })
            }
          >
            <option value="never">Never</option>
            <option value="until">On</option>
            <option value="count">After</option>
          </select>
          {value.endType === 'count' ? (
            <div className="grid grid-cols-[72px_1fr] items-center gap-2">
              <span className="text-sm text-muted-foreground">Occurrences</span>
              <FormField
                label=""
                type="number"
                value={String(value.count)}
                onChange={(next) => onChange({ ...value, count: Math.max(1, Number(next) || 1) })}
                id="recurrence-count"
              />
            </div>
          ) : null}
          {value.endType === 'until' ? (
            <FormField
              label="End date"
              type="date"
              value={value.until || anchorDate}
              onChange={(next) => onChange({ ...value, until: next })}
              id="recurrence-until"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function describeMonthlyWeekdayOption(anchorDate: string) {
  const date = new Date(`${anchorDate}T12:00:00`)
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' })
  const day = date.getDate()
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  let nth = 0
  for (let d = 1; d <= day; d += 1) {
    if (new Date(date.getFullYear(), date.getMonth(), d).getDay() === date.getDay()) nth += 1
  }
  let remaining = 0
  for (let d = day; d <= lastDay; d += 1) {
    if (new Date(date.getFullYear(), date.getMonth(), d).getDay() === date.getDay()) remaining += 1
  }
  if (remaining === 1) return `last ${weekday}`
  const ordinals = ['first', 'second', 'third', 'fourth', 'fifth']
  return `${ordinals[nth - 1] ?? `${nth}th`} ${weekday}`
}

export { defaultRecurrenceConfig }
