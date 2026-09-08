import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'

import { AddExpenseForm } from '@/components/ops/AddExpenseForm'
import { EditEntryForm, type EditableEntry } from '@/components/ops/EditEntryForm'
import {
  ManageAddButton,
  ManageIconButton,
  ManageTable,
  ManageTableBody,
  ManageTableHead,
  ManageTableRow,
  ManageTableTd,
  ManageTableTh,
} from '@/components/manage/ManageTable'
import { ManageActions } from '@/lib/workspacePermissions'
import { OperationDialog } from '@/components/layout/OperationDialog'
import { formatDayLabel, money } from '@/lib/financeUtils'
import { expenseToEditable } from '@/lib/manageUtils'
import { invalidatePlannerFinance } from '@/lib/queries/invalidate'
import { useExpensesQuery, useWorkspaceParams } from '@/lib/queries/hooks'
import type { Expense } from '@/lib/types'

export function ManageExpensesPanel() {
  const queryClient = useQueryClient()
  const { token, workspaceId, enabled: queriesEnabled } = useWorkspaceParams()
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const expensesQuery = useExpensesQuery(workspaceId, queriesEnabled)
  const expenses = expensesQuery.data ?? []
  const showLoading = expensesQuery.isPending && expenses.length === 0

  async function refresh() {
    if (!workspaceId) return
    await invalidatePlannerFinance(queryClient, workspaceId)
  }

  function openEdit(expense: Expense) {
    setEditEntry(expenseToEditable(expense))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end border-b px-4 py-3">
        <ManageActions area="finances">
          <ManageAddButton label="Add expense" onClick={() => setAddOpen(true)} />
        </ManageActions>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {showLoading ? (
          <p className="text-sm text-muted-foreground">Loading expenses…</p>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses yet.</p>
        ) : (
          <ManageTable>
            <ManageTableHead>
              <ManageTableTh>Title</ManageTableTh>
              <ManageTableTh>Amount</ManageTableTh>
              <ManageTableTh>Date</ManageTableTh>
              <ManageTableTh>Category</ManageTableTh>
              <ManageTableTh>Notes</ManageTableTh>
              <ManageTableTh>Last paid</ManageTableTh>
              <ManageTableTh className="w-12 text-right">Actions</ManageTableTh>
            </ManageTableHead>
            <ManageTableBody>
              {expenses.map((expense) => (
                <ManageTableRow key={expense.id}>
                  <ManageTableTd className="max-w-[220px] truncate font-medium">{expense.title}</ManageTableTd>
                  <ManageTableTd>{money(expense.amount)}</ManageTableTd>
                  <ManageTableTd className="whitespace-nowrap">{expense.expense_date}</ManageTableTd>
                  <ManageTableTd>{expense.category || '—'}</ManageTableTd>
                  <ManageTableTd className="max-w-[200px] truncate text-muted-foreground">
                    {expense.notes || '—'}
                  </ManageTableTd>
                  <ManageTableTd className="whitespace-nowrap text-muted-foreground">
                    {expense.paid && expense.paid_at ? formatDayLabel(expense.paid_at) : 'Never'}
                  </ManageTableTd>
                  <ManageTableTd className="text-right">
                    <ManageActions area="finances">
                      <ManageIconButton
                        icon={Pencil}
                        label="Edit expense"
                        onClick={() => openEdit(expense)}
                      />
                    </ManageActions>
                  </ManageTableTd>
                </ManageTableRow>
              ))}
            </ManageTableBody>
          </ManageTable>
        )}
      </div>

      <OperationDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add expense"
        description="Create a new expense."
      >
        {token && workspaceId ? (
          <AddExpenseForm
            token={token}
            workspaceId={workspaceId}
            onCreated={() => {
              setAddOpen(false)
              void refresh()
            }}
          />
        ) : null}
      </OperationDialog>

      <OperationDialog
        open={Boolean(editEntry && token && workspaceId)}
        onOpenChange={(open) => {
          if (!open) setEditEntry(null)
        }}
        title="Edit expense"
      >
        {editEntry && token && workspaceId ? (
          <EditEntryForm
            token={token}
            workspaceId={workspaceId}
            entry={editEntry}
            onSaved={() => {
              setEditEntry(null)
              void refresh()
            }}
            onDeleted={() => {
              setEditEntry(null)
              void refresh()
            }}
          />
        ) : null}
      </OperationDialog>
    </div>
  )
}
