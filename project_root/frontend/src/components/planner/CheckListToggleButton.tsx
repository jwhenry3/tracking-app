import { ListChecks } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type CheckListToggleButtonProps = {
  visible: boolean
  label: string
  onToggle: () => void
}

export function CheckListToggleButton({ visible, label, onToggle }: CheckListToggleButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'h-8 w-8 shrink-0 p-0',
        visible ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
      title={visible ? `Hide task list for ${label}` : `Show task list for ${label}`}
      aria-label={visible ? `Hide task list for ${label}` : `Show task list for ${label}`}
      aria-pressed={visible}
      onClick={onToggle}
    >
      <ListChecks className="h-4 w-4" />
    </Button>
  )
}
