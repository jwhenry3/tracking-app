import { type FormEvent, useEffect, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import { OperationDialog } from '@/components/layout/OperationDialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { payExpense, skipExpense } from '@/lib/api'
import { formatDayLabel, money, normalizeFinanceDate } from '@/lib/financeUtils'
import type { Expense } from '@/lib/types'

type PayExpenseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  workspaceId: number
  expense: Expense | null
  onComplete: () => void
}

export function PayExpenseDialog({
  open,
  onOpenChange,
  token,
  workspaceId,
  expense,
  onComplete,
}: PayExpenseDialogProps) {
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!expense) return
    setAmount(String(expense.amount))
    setPaidAt(normalizeFinanceDate(expense.paid_at) || new Date().toISOString().slice(0, 10))
    setNotes(expense.payment_notes ?? '')
  }, [expense])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!expense) return
    setBusy(true)
    try {
      await payExpense(token, workspaceId, expense, {
        paid: true,
        paid_at: paidAt,
        amount: Number(amount),
        payment_notes: notes.trim(),
      })
      onComplete()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleSkipPayment() {
    if (!expense) return
    setBusy(true)
    try {
      await skipExpense(token, workspaceId, expense, {
        payment_notes: notes.trim(),
      })
      onComplete()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleClearStatus() {
    if (!expense) return
    setBusy(true)
    try {
      await payExpense(token, workspaceId, expense, { paid: false })
      onComplete()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  if (!expense) {
    return null
  }

  const dialogTitle = expense.paid
    ? 'Payment recorded'
    : expense.skipped
      ? 'Payment skipped'
      : 'Record payment'

  const dialogDescription = expense.paid
    ? 'This expense is marked paid.'
    : expense.skipped
      ? 'This expense was skipped for this cycle.'
      : 'Confirm payment details, add notes, or skip this expense.'

  return (
    <OperationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={dialogTitle}
      description={dialogDescription}
    >
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="font-medium">{expense.title}</p>
          <p className="text-sm text-muted-foreground">
            {formatDayLabel(expense.expense_date)} · {expense.category}
          </p>
        </div>

        {expense.paid || expense.skipped ? (
          <>
            <div className="space-y-1 text-sm">
              {!expense.skipped ? (
                <>
                  <p><span className="text-muted-foreground">Amount paid:</span> {money(expense.amount)}</p>
                  {expense.paid_at ? (
                    <p><span className="text-muted-foreground">Paid on:</span> {formatDayLabel(expense.paid_at)}</p>
                  ) : null}
                </>
              ) : (
                <p><span className="text-muted-foreground">Status:</span> Skipped for this cycle</p>
              )}
              {expense.payment_notes ? (
                <p><span className="text-muted-foreground">Notes:</span> {expense.payment_notes}</p>
              ) : null}
            </div>
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void handleClearStatus()}>
              {expense.skipped ? 'Undo skip' : 'Mark as unpaid'}
            </Button>
          </>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <FormField
              label="Payment amount"
              type="number"
              value={amount}
              onChange={setAmount}
              id="pay-expense-amount"
            />
            <FormField
              label="Payment date"
              type="date"
              value={paidAt}
              onChange={setPaidAt}
              id="pay-expense-date"
            />
            <div className="space-y-2">
              <Label htmlFor="pay-expense-notes">Payment notes</Label>
              <Textarea
                id="pay-expense-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Confirmation number, bank reference, etc."
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !amount}>
              Record payment
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => void handleSkipPayment()}
            >
              Skip payment
            </Button>
          </form>
        )}
      </div>
    </OperationDialog>
  )
}
