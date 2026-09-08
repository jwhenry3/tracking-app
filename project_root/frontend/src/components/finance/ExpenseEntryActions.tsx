import { CircleDollarSign, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ManageActions } from '@/lib/workspacePermissions'
import type { Expense } from '@/lib/types'

type ExpenseEntryActionsProps = {
  expense: Expense
  onPay: () => void
  onEdit: () => void
}

export function ExpenseEntryActions({ expense, onPay, onEdit }: ExpenseEntryActionsProps) {
  return (
    <ManageActions area="finances">
    <div className="flex shrink-0 gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        title={expense.paid ? 'View payment' : expense.skipped ? 'View skip' : 'Record payment'}
        aria-label={expense.paid ? 'View payment' : expense.skipped ? 'View skip' : 'Record payment'}
        onClick={onPay}
      >
        <CircleDollarSign
          className={`h-4 w-4 ${expense.paid ? 'text-[#15803d]' : expense.skipped ? 'text-muted-foreground' : ''}`}
        />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        title="Edit expense"
        aria-label="Edit expense"
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
    </ManageActions>
  )
}
