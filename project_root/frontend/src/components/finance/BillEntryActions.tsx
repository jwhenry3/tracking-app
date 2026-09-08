import { CircleDollarSign, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ManageActions } from '@/lib/workspacePermissions'
import type { Bill } from '@/lib/types'

type BillEntryActionsProps = {
  bill: Bill
  onPay: () => void
  onEdit: () => void
}

export function BillEntryActions({ bill, onPay, onEdit }: BillEntryActionsProps) {
  return (
    <ManageActions area="finances">
    <div className="flex shrink-0 gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        title={bill.paid ? 'View payment' : 'Record payment'}
        aria-label={bill.paid ? 'View payment' : 'Record payment'}
        onClick={onPay}
      >
        <CircleDollarSign className={`h-4 w-4 ${bill.paid ? 'text-[#15803d]' : ''}`} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        title="Edit bill"
        aria-label="Edit bill"
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
    </ManageActions>
  )
}
