import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'

import { AddEventForm } from '@/components/ops/AddEventForm'
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
import { eventSeriesToPlannerEvent } from '@/lib/manageUtils'
import { invalidatePlannerFinance } from '@/lib/queries/invalidate'
import { useEventSeriesQuery, useWorkspaceParams } from '@/lib/queries/hooks'
import type { EventSeries } from '@/lib/types'

export function ManageEventsPanel() {
  const queryClient = useQueryClient()
  const { token, workspaceId, enabled: queriesEnabled } = useWorkspaceParams()
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const eventsQuery = useEventSeriesQuery(workspaceId, queriesEnabled)
  const events = eventsQuery.data ?? []
  const showLoading = eventsQuery.isPending && events.length === 0

  async function refresh() {
    if (!workspaceId) return
    await invalidatePlannerFinance(queryClient, workspaceId)
  }

  function openEdit(series: EventSeries) {
    setEditEntry({ kind: 'event', data: eventSeriesToPlannerEvent(series) })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end border-b px-4 py-3">
        <ManageActions area="planning">
          <ManageAddButton label="Add event" onClick={() => setAddOpen(true)} />
        </ManageActions>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
        {showLoading ? (
          <p className="text-sm text-muted-foreground">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ManageTable>
            <ManageTableHead>
              <ManageTableTh>Title</ManageTableTh>
              <ManageTableTh>Starts</ManageTableTh>
              <ManageTableTh>Recurrence</ManageTableTh>
              <ManageTableTh className="w-12 text-right">Actions</ManageTableTh>
            </ManageTableHead>
            <ManageTableBody>
              {events.map((event) => (
                <ManageTableRow key={event.id}>
                  <ManageTableTd className="max-w-[260px]">
                    <EntryTypeTitle kind="event" title={event.title} />
                  </ManageTableTd>
                  <ManageTableTd className="whitespace-nowrap">
                    {event.series_anchor_date ?? event.start_at.slice(0, 10)}
                  </ManageTableTd>
                  <ManageTableTd className="max-w-[280px] truncate text-muted-foreground">
                    {describeRecurrence(
                      event.recurrence,
                      event.series_anchor_date ?? event.start_at.slice(0, 10),
                    )}
                  </ManageTableTd>
                  <ManageTableTd className="text-right">
                    <ManageActions area="planning">
                      <ManageIconButton
                        icon={Pencil}
                        label="Edit event"
                        onClick={() => openEdit(event)}
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
        title="Add event"
        description="Create a new event series."
      >
        {token && workspaceId ? (
          <AddEventForm
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
        title="Edit event"
        description="Changes apply to the event series."
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
