import { FormField } from '@/components/forms/FormField'
import type { EventTimeRangeState } from '@/lib/eventTimeRange'

type EventTimeRangeFieldsProps = {
  value: EventTimeRangeState
  onChange: (next: EventTimeRangeState) => void
  idPrefix?: string
}

export function EventTimeRangeFields({
  value,
  onChange,
  idPrefix = 'event-time',
}: EventTimeRangeFieldsProps) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.useTimeRange}
          onChange={(event) => onChange({ ...value, useTimeRange: event.target.checked })}
        />
        Add time range
      </label>
      {value.useTimeRange ? (
        <div className="grid grid-cols-2 gap-3">
          <FormField
            id={`${idPrefix}-start`}
            label="Start time"
            type="time"
            value={value.startTime}
            onChange={(startTime) => onChange({ ...value, startTime })}
          />
          <FormField
            id={`${idPrefix}-end`}
            label="End time"
            type="time"
            value={value.endTime}
            onChange={(endTime) => onChange({ ...value, endTime })}
          />
        </div>
      ) : null}
    </div>
  )
}
