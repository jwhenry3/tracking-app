import { ListChecks } from 'lucide-react'
import type { CSSProperties } from 'react'

import { scheduleChipColors } from '@/lib/scheduleChipStyles'

export type WeekCheckListItem = {
  listId: number
  name: string
  day: string
  occurrence?: string | null
  completedCount: number
  totalCount: number
}

export function CheckListChip({
  item,
  onClick,
}: {
  item: WeekCheckListItem
  onClick: () => void
}) {
  const progress =
    item.totalCount > 0 ? `${item.completedCount}/${item.totalCount}` : null

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="schedule-chip w-full text-left"
      style={{ '--schedule-chip-color': scheduleChipColors.checklist } as CSSProperties}
      title={item.name}
    >
      <ListChecks className="h-3 w-3 shrink-0" />
      <span className="truncate">{item.name}</span>
      {progress ? <span className="shrink-0 text-[10px] opacity-80">{progress}</span> : null}
    </button>
  )
}
