import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'

import { AddIncomeForm } from '@/components/ops/AddIncomeForm'
import { EditEntryForm, type EditableEntry } from '@/components/ops/EditEntryForm'
import { EntryTypeTitle } from '@/components/ops/EntryTypeIcon'
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
import { describeRecurrence } from '@/lib/recurrence'
import { money } from '@/lib/financeUtils'
import { incomeSeriesToIncome } from '@/lib/manageUtils'
import { invalidatePlannerFinance } from '@/lib/queries/invalidate'
import { useIncomeSeriesQuery, useWorkspaceParams } from '@/lib/queries/hooks'
import type { IncomeSeries } from '@/lib/types'

export function ManageIncomePanel() {
  const queryClient = useQueryClient()
  const { token, workspaceId, enabled: queriesEnabled } = useWorkspaceParams()
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const incomeQuery = useIncomeSeriesQuery(workspaceId, queriesEnabled)
  const income = incomeQuery.data ?? []
  const showLoading = incomeQuery.isPending && income.length === 0

  async function refresh() {
    if (!workspaceId) return
    await invalidatePlannerFinance(queryClient, workspaceId)
  }

  function openEdit(series: IncomeSeries) {
    setEditEntry({ kind: 'income', data: incomeSeriesToIncome(series) })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end border-b px-4 py-3">
        <ManageActions area="finances">
          <ManageAddButton label="Add income" onClick={() => setAddOpen(true)} />
        </ManageActions>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
        {showLoading ? (
          <p className="text-sm text-muted-foreground">Loading income sources…</p>
        ) : income.length === 0 ? (
          <p className="text-sm text-muted-foreground">No income sources yet.</p>
        ) : (
          <ManageTable>
            <ManageTableHead>
              <ManageTableTh>Title</ManageTableTh>
              <ManageTableTh>Amount</ManageTableTh>
              <ManageTableTh>Date</ManageTableTh>
              <ManageTableTh>Recurrence</ManageTableTh>
              <ManageTableTh>Notes</ManageTableTh>
              <ManageTableTh className="w-12 text-right">Actions</ManageTableTh>
            </ManageTableHead>
            <ManageTableBody>
              {income.map((entry) => (
                <ManageTableRow key={entry.id}>
                  <ManageTableTd className="max-w-[220px]">
                    <EntryTypeTitle kind="income" title={entry.title} />
                  </ManageTableTd>
                  <ManageTableTd>{money(entry.amount)}</ManageTableTd>
                  <ManageTableTd className="whitespace-nowrap">{entry.entry_date}</ManageTableTd>
                  <ManageTableTd className="max-w-[200px] truncate text-muted-foreground">
                    {describeRecurrence(entry.recurrence, entry.entry_date)}
                  </ManageTableTd>
                  <ManageTableTd className="max-w-[200px] truncate text-muted-foreground">
                    {entry.notes || '—'}
                  </ManageTableTd>
                  <ManageTableTd className="text-right">
                    <ManageActions area="finances">
                      <ManageIconButton
                        icon={Pencil}
                        label="Edit income"
                        onClick={() => openEdit(entry)}
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
        title="Add income"
        description="Create a new income source."
      >
        {token && workspaceId ? (
          <AddIncomeForm
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
        title="Edit income"
        description="Changes apply to the income series."
      >
        {editEntry && token && workspaceId ? (
          <EditEntryForm
            token={token}
            workspaceId={workspaceId}
            entry={editEntry}
            defaultScope="all"
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
