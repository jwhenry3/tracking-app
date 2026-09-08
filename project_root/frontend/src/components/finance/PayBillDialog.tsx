import { type FormEvent, useEffect, useState } from 'react'

import { FormField } from '@/components/forms/FormField'
import { OperationDialog } from '@/components/layout/OperationDialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { payBillOccurrence, skipBillOccurrence } from '@/lib/api'
import { formatDayLabel, money, normalizeFinanceDate } from '@/lib/financeUtils'
import type { Bill } from '@/lib/types'

type PayBillDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  workspaceId: number
  bill: Bill | null
  onComplete: () => void
}

export function PayBillDialog({
  open,
  onOpenChange,
  token,
  workspaceId,
  bill,
  onComplete,
}: PayBillDialogProps) {
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!bill) return
    setAmount(String(bill.amount))
    setPaidAt(normalizeFinanceDate(bill.paid_at) || new Date().toISOString().slice(0, 10))
    setNotes(bill.payment_notes ?? '')
  }, [bill])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!bill) return
    setBusy(true)
    try {
      await payBillOccurrence(token, workspaceId, bill, {
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
    if (!bill) return
    setBusy(true)
    try {
      await skipBillOccurrence(token, workspaceId, bill, {
        payment_notes: notes.trim(),
      })
      onComplete()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleClearStatus() {
    if (!bill) return
    setBusy(true)
    try {
      await payBillOccurrence(token, workspaceId, bill, { paid: false })
      onComplete()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  if (!bill) {
    return null
  }

  const dialogTitle = bill.paid
    ? 'Payment recorded'
    : bill.skipped
      ? 'Payment skipped'
      : 'Record payment'

  const dialogDescription = bill.paid
    ? 'This bill occurrence is marked paid.'
    : bill.skipped
      ? 'This bill occurrence was skipped for this cycle.'
      : 'Confirm payment details, add notes, or skip this occurrence.'

  return (
    <OperationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={dialogTitle}
      description={dialogDescription}
    >
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="font-medium">{bill.title}</p>
          <p className="text-sm text-muted-foreground">
            Due {formatDayLabel(bill.due_date)} · {bill.category}
          </p>
          {bill.is_recurring ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Changes apply to this occurrence only.
            </p>
          ) : null}
        </div>

        {bill.paid || bill.skipped ? (
          <>
            <div className="space-y-1 text-sm">
              {!bill.skipped ? (
                <>
                  <p><span className="text-muted-foreground">Amount paid:</span> {money(bill.amount)}</p>
                  {bill.paid_at ? (
                    <p><span className="text-muted-foreground">Paid on:</span> {formatDayLabel(bill.paid_at)}</p>
                  ) : null}
                </>
              ) : (
                <p><span className="text-muted-foreground">Status:</span> Skipped for this cycle</p>
              )}
              {bill.payment_notes ? (
                <p><span className="text-muted-foreground">Notes:</span> {bill.payment_notes}</p>
              ) : null}
            </div>
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void handleClearStatus()}>
              {bill.skipped ? 'Undo skip' : 'Mark as unpaid'}
            </Button>
          </>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <FormField
              label="Payment amount"
              type="number"
              value={amount}
              onChange={setAmount}
              id="pay-bill-amount"
            />
            <FormField
              label="Payment date"
              type="date"
              value={paidAt}
              onChange={setPaidAt}
              id="pay-bill-date"
            />
            <div className="space-y-2">
              <Label htmlFor="pay-bill-notes">Payment notes</Label>
              <Textarea
                id="pay-bill-notes"
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
