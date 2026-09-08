import { Label } from '@/components/ui/label'
import type { OccurrenceScope } from '@/lib/recurrence'

type OccurrenceScopePickerProps = {
  value: OccurrenceScope
  onChange: (value: OccurrenceScope) => void
  recurring: boolean
  entryLabel?: string
}

export function OccurrenceScopePicker({
  value,
  onChange,
  recurring,
  entryLabel = 'event',
}: OccurrenceScopePickerProps) {
  if (!recurring) {
    return null
  }

  return (
    <div className="space-y-2">
      <Label>Apply changes to</Label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value as OccurrenceScope)}
      >
        <option value="this">This {entryLabel} only</option>
        <option value="following">This and following {entryLabel}s</option>
        <option value="all">All {entryLabel}s</option>
      </select>
    </div>
  )
}

export function OccurrenceMeta({
  isRecurring,
  recurrence,
}: {
  isRecurring: boolean
  recurrence: string
}) {
  if (!isRecurring) {
    return null
  }

  return (
    <p className="text-xs text-muted-foreground">
      {recurrence}
    </p>
  )
}
