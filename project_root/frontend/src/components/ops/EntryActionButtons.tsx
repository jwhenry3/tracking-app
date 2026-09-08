import { Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'

type EntryActionButtonsProps = {
  onEdit: () => void
  onDelete?: () => void
}

export function EntryActionButtons({ onEdit, onDelete }: EntryActionButtonsProps) {
  return (
    <div className="flex shrink-0 gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        title="Edit"
        aria-label="Edit"
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      {onDelete ? (
        <Button variant="ghost" size="sm" onClick={onDelete}>
          Delete
        </Button>
      ) : null}
    </div>
  )
}
