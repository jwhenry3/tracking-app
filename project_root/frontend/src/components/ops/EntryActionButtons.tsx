import { Button } from '@/components/ui/button'

type EntryActionButtonsProps = {
  onEdit: () => void
  onDelete?: () => void
}

export function EntryActionButtons({ onEdit, onDelete }: EntryActionButtonsProps) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        Edit
      </Button>
      {onDelete ? (
        <Button variant="ghost" size="sm" onClick={onDelete}>
          Delete
        </Button>
      ) : null}
    </div>
  )
}
