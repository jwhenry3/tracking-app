import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'

import { AddBillForm } from '@/components/ops/AddBillForm'
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
import { MaterialTabs } from '@/components/layout/MaterialTabs'
import { describeRecurrence } from '@/lib/recurrence'
import { formatDayLabel, money } from '@/lib/financeUtils'
import { billSeriesToBill } from '@/lib/manageUtils'
import { invalidatePlannerFinance } from '@/lib/queries/invalidate'
import { useBillSeriesQuery, useWorkspaceParams } from '@/lib/queries/hooks'
import type { BillSeries } from '@/lib/types'

type BillTab = 'active' | 'paid_off'

export function ManageBillsPanel() {
  const queryClient = useQueryClient()
  const { token, workspaceId, enabled: queriesEnabled } = useWorkspaceParams()
  const [tab, setTab] = useState<BillTab>('active')
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const billsQuery = useBillSeriesQuery(workspaceId, tab, queriesEnabled)
  const bills = billsQuery.data ?? []
  const showLoading = billsQuery.isPending && bills.length === 0

  async function refresh() {
    if (!workspaceId) return
    await invalidatePlannerFinance(queryClient, workspaceId)
  }

  function openEdit(series: BillSeries) {
    setEditEntry({ kind: 'bill', data: billSeriesToBill(series) })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <MaterialTabs
          activeTab={tab}
          onChange={(value) => setTab(value as BillTab)}
          tabs={[
            { id: 'active', label: 'Active bills' },
            { id: 'paid_off', label: 'Paid off' },
          ]}
        />
        <ManageActions area="finances">
          <ManageAddButton label="Add bill" onClick={() => setAddOpen(true)} />
        </ManageActions>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {showLoading ? (
          <p className="text-sm text-muted-foreground">Loading bills…</p>
        ) : bills.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tab === 'paid_off' ? 'No paid-off bills.' : 'No active bills.'}
          </p>
        ) : (
          <ManageTable>
            <ManageTableHead>
              <ManageTableTh>Title</ManageTableTh>
              <ManageTableTh>Amount</ManageTableTh>
              <ManageTableTh>Due</ManageTableTh>
              <ManageTableTh>Category</ManageTableTh>
              <ManageTableTh>Recurrence</ManageTableTh>
              <ManageTableTh>Last paid</ManageTableTh>
              <ManageTableTh className="w-12 text-right">Actions</ManageTableTh>
            </ManageTableHead>
            <ManageTableBody>
              {bills.map((bill) => (
                <ManageTableRow key={bill.id}>
                  <ManageTableTd className="max-w-[220px] truncate font-medium">
                    {bill.title}
                    {bill.paid_off ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">Paid off</span>
                    ) : null}
                  </ManageTableTd>
                  <ManageTableTd>{money(bill.amount)}</ManageTableTd>
                  <ManageTableTd className="whitespace-nowrap">{bill.due_date}</ManageTableTd>
                  <ManageTableTd>{bill.category || '—'}</ManageTableTd>
                  <ManageTableTd className="max-w-[200px] truncate text-muted-foreground">
                    {describeRecurrence(bill.recurrence, bill.due_date)}
                  </ManageTableTd>
                  <ManageTableTd className="whitespace-nowrap text-muted-foreground">
                    {bill.last_paid_at ? formatDayLabel(bill.last_paid_at) : 'Never'}
                  </ManageTableTd>
                  <ManageTableTd className="text-right">
                    <ManageActions area="finances">
                      <ManageIconButton
                        icon={Pencil}
                        label="Edit bill"
                        onClick={() => openEdit(bill)}
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
        title="Add bill"
        description="Create a new bill series."
      >
        {token && workspaceId ? (
          <AddBillForm
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
        title="Edit bill"
        description="Changes apply to the bill series."
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
