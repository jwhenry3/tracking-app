import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { CheckSquare, Pencil, Plus, Trash2 } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { FormField } from '@/components/forms/FormField'
import { CheckListKindPicker } from '@/components/forms/CheckListKindPicker'
import { RecurrencePicker } from '@/components/forms/RecurrencePicker'
import { OperationDialog, OpsTabs } from '@/components/layout/OperationDialog'
import { PageHeader, PageHeaderIconButton } from '@/components/layout/PageHeader'
import { InlineCheckListItem } from '@/components/planner/InlineCheckListItem'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTodo, createTodoList, deleteTodoList, updateTodoList } from '@/lib/api'
import {
  buildCheckListWritePayload,
  checkListFormFromList,
  defaultCheckListFormState,
  type CheckListFormState,
} from '@/lib/checklistListForm'
import {
  currentPeriodStart,
  formatPeriodRange,
  isPeriodicList,
  listPeriodScope,
  periodScopeLabel,
  periodScopeTitle,
} from '@/lib/checklistPeriods'
import { toLocalIsoDate } from '@/lib/calendarUtils'
import { normalizeFinanceDate } from '@/lib/financeUtils'
import { invalidateCheckLists } from '@/lib/queries/invalidate'
import {
  useTodoListsQuery,
  useTodosQuery,
} from '@/lib/queries/hooks'
import { buildRecurrenceRule, describeRecurrence } from '@/lib/recurrence'
import type { PeriodScope, TodoList } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWorkspacePermissions } from '@/lib/workspacePermissions'
import { useAuthStore } from '@/stores/authStore'

type CheckListTab = 'item' | 'list'

function formatListDate(date: string) {
  const normalized = normalizeFinanceDate(date)
  if (!normalized) return '—'
  return new Date(`${normalized}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function listSubtitle(list: TodoList) {
  const scope = listPeriodScope(list)
  if (isPeriodicList(list) && list.list_date && scope) {
    const periodLabel = formatPeriodRange(list.list_date, scope)
    if (list.is_recurring) {
      return `${periodScopeTitle(scope)} · ${periodLabel}`
    }
    return periodLabel
  }
  if (list.kind === 'daily' && list.list_date) {
    const dateLabel = formatListDate(list.list_date)
    if (list.is_recurring && list.recurrence) {
      return `${dateLabel} · ${describeRecurrence(list.recurrence, list.list_date)}`
    }
    return dateLabel
  }
  return 'General list'
}

function deleteListDescription(list: TodoList) {
  const scope = listPeriodScope(list)
  if (isPeriodicList(list) && list.list_date && scope) {
    const periodLabel = formatPeriodRange(list.list_date, scope)
    return `Remove this ${periodScopeLabel(scope)} task list for ${periodLabel}? All tasks in this period will be deleted.`
  }
  if (list.kind === 'daily' && list.list_date) {
    return `Remove the daily plan for ${formatListDate(list.list_date)}? All tasks in this plan will be deleted.`
  }
  return `Remove "${list.name}"? All tasks in this list will be deleted.`
}

function CheckListScheduleFields({
  form,
  onChange,
  idPrefix,
}: {
  form: CheckListFormState
  onChange: (next: CheckListFormState) => void
  idPrefix: string
}) {
  return (
    <>
      <CheckListKindPicker
        id={`${idPrefix}-type`}
        value={form.kind}
        onChange={(kind) => onChange({ ...form, kind })}
      />
      {form.kind === 'periodic' ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-period-scope`}>Period</Label>
          <select
            id={`${idPrefix}-period-scope`}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.periodScope}
            onChange={(event) =>
              onChange({ ...form, periodScope: event.target.value as PeriodScope })
            }
          >
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
        </div>
      ) : null}
      {form.kind !== 'general' ? (
        <FormField
          label={
            form.kind === 'periodic'
              ? form.periodScope === 'week'
                ? 'Week containing'
                : form.periodScope === 'month'
                  ? 'Month containing'
                  : 'Year containing'
              : 'Start date'
          }
          type="date"
          value={form.date}
          onChange={(date) => onChange({ ...form, date })}
          id={`${idPrefix}-start-date`}
        />
      ) : null}
      {form.kind === 'recurring' ? (
        <RecurrencePicker
          value={form.recurrence}
          anchorDate={form.date}
          onChange={(recurrence) => onChange({ ...form, recurrence })}
        />
      ) : null}
    </>
  )
}

export function CheckListsView() {
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
  const { canManagePlanning } = useWorkspacePermissions()
  const queryClient = useQueryClient()
  const workspaceNumericId = workspaceId ? Number(workspaceId) : null
  const queriesEnabled = Boolean(token && workspaceNumericId)

  const today = toLocalIsoDate()
  const [activeListId, setActiveListId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<CheckListTab>('item')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TodoList | null>(null)
  const [editForm, setEditForm] = useState<CheckListFormState>(() => defaultCheckListFormState())
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TodoList | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [itemTitle, setItemTitle] = useState('')
  const [listForm, setListForm] = useState<CheckListFormState>(() => defaultCheckListFormState())

  const listsQuery = useTodoListsQuery(workspaceNumericId, undefined, queriesEnabled)
  const lists = listsQuery.data ?? []
  const sortedLists = useMemo(() => {
    const daily = lists
      .filter((list) => list.kind === 'daily')
      .sort((a, b) => (b.list_date ?? '').localeCompare(a.list_date ?? ''))
    const periodic = lists
      .filter((list) => isPeriodicList(list))
      .sort((a, b) => (b.list_date ?? '').localeCompare(a.list_date ?? ''))
    const general = lists
      .filter((list) => list.kind === 'general')
      .sort((a, b) => a.name.localeCompare(b.name))
    return [...daily, ...periodic, ...general]
  }, [lists])

  const todosQuery = useTodosQuery(workspaceNumericId, activeListId, queriesEnabled && Boolean(activeListId))
  const items = todosQuery.data ?? []

  useEffect(() => {
    if (!sortedLists.length) {
      setActiveListId(null)
      return
    }
    setActiveListId((current) => {
      if (current && sortedLists.some((list) => list.id === current)) return current
      const todayDaily = sortedLists.find((list) => list.kind === 'daily' && list.list_date === today)
      if (todayDaily) return todayDaily.id
      const periodicMatch = sortedLists.find((list) => {
        const scope = listPeriodScope(list)
        return (
          isPeriodicList(list) &&
          scope &&
          list.list_date === currentPeriodStart(scope, new Date(`${today}T12:00:00`))
        )
      })
      return periodicMatch?.id ?? sortedLists[0]?.id ?? null
    })
  }, [sortedLists, today])

  async function refreshLists() {
    if (!workspaceNumericId) return
    await invalidateCheckLists(queryClient, workspaceNumericId)
  }

  function closeDialog() {
    setDialogOpen(false)
    setListForm(defaultCheckListFormState(today))
  }

  function openEditDialog(list: TodoList) {
    setEditTarget(list)
    setEditForm(checkListFormFromList(list, today))
  }

  function closeEditDialog() {
    setEditTarget(null)
    setEditForm(defaultCheckListFormState(today))
  }

  async function handleCreateItem(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspaceNumericId || !activeListId || !itemTitle.trim()) return
    await createTodo(token, workspaceNumericId, { list_id: activeListId, title: itemTitle.trim() })
    setItemTitle('')
    await refreshLists()
    closeDialog()
  }

  async function handleCreateList(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspaceNumericId) return

    const payload = buildCheckListWritePayload(
      listForm,
      buildRecurrenceRule(listForm.recurrence, listForm.date),
      today,
    )
    if (!payload) return

    const list = await createTodoList(token, workspaceNumericId, payload)
    setListForm(defaultCheckListFormState(today))
    setActiveListId(list.id)
    await refreshLists()
    closeDialog()
  }

  async function handleUpdateList(event: FormEvent) {
    event.preventDefault()
    if (!token || !workspaceNumericId || !editTarget) return

    setSavingEdit(true)
    try {
      const payload = buildCheckListWritePayload(
        editForm,
        buildRecurrenceRule(editForm.recurrence, editForm.date),
        today,
      )
      if (!payload) return

      const updated = await updateTodoList(token, workspaceNumericId, editTarget.id, payload)
      setActiveListId(updated.id)
      closeEditDialog()
      await refreshLists()
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDeleteList() {
    if (!token || !workspaceNumericId || !deleteTarget) return
    setDeleting(true)
    try {
      await deleteTodoList(token, workspaceNumericId, deleteTarget.id)
      if (activeListId === deleteTarget.id) {
        const remaining = sortedLists.filter((list) => list.id !== deleteTarget.id)
        setActiveListId(remaining[0]?.id ?? null)
      }
      setDeleteTarget(null)
      await refreshLists()
    } finally {
      setDeleting(false)
    }
  }

  const activeList = sortedLists.find((list) => list.id === activeListId)
  const dailyLists = sortedLists.filter((list) => list.kind === 'daily')
  const periodicLists = sortedLists.filter((list) => isPeriodicList(list))
  const generalLists = sortedLists.filter((list) => list.kind === 'general')

  if (!token || !workspaceId || !workspaceNumericId) {
    return null
  }

  function renderListButton(list: TodoList, compact = false) {
    const selected = activeListId === list.id
    return (
      <div
        key={list.id}
        className={cn(
          'flex items-center gap-1',
          compact ? 'shrink-0' : 'w-full',
        )}
      >
        <button
          type="button"
          onClick={() => setActiveListId(list.id)}
          className={cn(
            'min-w-0 text-left transition',
            compact
              ? 'shrink-0 rounded-full border px-3 py-1.5 text-sm'
              : 'flex-1 rounded-lg border px-3 py-2 text-sm',
            selected
              ? compact
                ? 'border-primary bg-primary/10 font-medium'
                : 'border-primary bg-primary/5'
              : 'hover:bg-muted',
          )}
        >
          <p className={cn('truncate font-medium', compact && 'max-w-[10rem]')}>{list.name}</p>
          {!compact ? (
            <p className="text-xs text-muted-foreground">{listSubtitle(list)}</p>
          ) : null}
        </button>
        {canManagePlanning ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'shrink-0 p-0 text-muted-foreground hover:text-foreground',
                compact ? 'h-8 w-8' : 'h-8 w-8',
              )}
              aria-label={`Edit ${list.name}`}
              onClick={() => openEditDialog(list)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'shrink-0 p-0 text-muted-foreground hover:text-destructive',
                compact ? 'h-8 w-8' : 'h-8 w-8',
              )}
              aria-label={`Delete ${list.name}`}
              onClick={() => setDeleteTarget(list)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        ) : null}
      </div>
    )
  }

  function renderListSection(title: string, sectionLists: TodoList[]) {
    if (sectionLists.length === 0) return null
    return (
      <div className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {sectionLists.map((list) => renderListButton(list))}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        icon={CheckSquare}
        title="Task list"
        subtitle={`Active list: ${activeList?.name ?? 'None selected'}`}
        className="shrink-0"
      >
        {canManagePlanning ? (
          <>
            {activeList ? (
              <PageHeaderIconButton
                icon={Pencil}
                label={`Edit ${activeList.name}`}
                onClick={() => openEditDialog(activeList)}
              />
            ) : null}
            {activeList ? (
              <PageHeaderIconButton
                icon={Trash2}
                label={`Delete ${activeList.name}`}
                onClick={() => setDeleteTarget(activeList)}
              />
            ) : null}
            <PageHeaderIconButton icon={Plus} label="Add item" onClick={() => setDialogOpen(true)} />
          </>
        ) : null}
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 md:p-4">
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-4 md:grid-cols-2 md:grid-rows-1 md:gap-6">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="shrink-0">
              <CardTitle>Lists</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              {sortedLists.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lists yet.</p>
              ) : (
                <>
                  {renderListSection('Daily plans', dailyLists)}
                  {renderListSection('Periodic plans', periodicLists)}
                  {renderListSection('General', generalLists)}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="shrink-0">
              <CardTitle>{activeList?.name ?? 'Tasks'}</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {!activeListId ? (
                <p className="text-sm text-muted-foreground">Select a list to view items.</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items in this list.</p>
              ) : (
                items.map((item) => (
                  <InlineCheckListItem
                    key={item.id}
                    token={token}
                    workspaceId={workspaceNumericId}
                    item={item}
                    onChange={() => void refreshLists()}
                  />
                ))
              )}
              {canManagePlanning && activeListId ? (
                <form
                  className="sticky bottom-0 flex gap-2 border-t bg-card pt-2"
                  onSubmit={(event) => {
                  event.preventDefault()
                  if (!activeListId || !itemTitle.trim()) return
                  void (async () => {
                    await createTodo(token, workspaceNumericId, {
                      list_id: activeListId,
                      title: itemTitle.trim(),
                    })
                    setItemTitle('')
                    await refreshLists()
                  })()
                }}
              >
                <Input
                  value={itemTitle}
                  onChange={(event) => setItemTitle(event.target.value)}
                  placeholder="Add a task"
                />
                <Button type="submit" disabled={!activeListId || !itemTitle.trim()}>Add</Button>
                </form>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <OperationDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Add to task list">
        <OpsTabs
          tabs={[
            { id: 'item', label: 'Item' },
            { id: 'list', label: 'List' },
          ]}
          activeTab={activeTab}
          onChange={(tabId) => setActiveTab(tabId as CheckListTab)}
        />

        {activeTab === 'item' ? (
          <form className="space-y-4" onSubmit={(event) => void handleCreateItem(event)}>
            <p className="text-sm text-muted-foreground">
              Target list: {activeList?.name ?? 'Select a list'}
            </p>
            <FormField label="Item title" value={itemTitle} onChange={setItemTitle} id="checklist-item-title" />
            <Button type="submit" className="w-full" disabled={!activeListId}>Add item</Button>
          </form>
        ) : null}

        {activeTab === 'list' ? (
          <form className="space-y-4" onSubmit={(event) => void handleCreateList(event)}>
            <FormField
              label="List name"
              value={listForm.name}
              onChange={(name) => setListForm((current) => ({ ...current, name }))}
              id="list-name"
            />
            <CheckListScheduleFields
              form={listForm}
              onChange={setListForm}
              idPrefix="create"
            />
            <Button type="submit" className="w-full">Create list</Button>
          </form>
        ) : null}
      </OperationDialog>

      <OperationDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeEditDialog()
        }}
        title="Edit task list"
        description={
          editTarget?.series_id
            ? 'Changes apply to the whole recurring or periodic series, including future periods.'
            : undefined
        }
      >
        <form className="space-y-4" onSubmit={(event) => void handleUpdateList(event)}>
          <FormField
            label="List name"
            value={editForm.name}
            onChange={(name) => setEditForm((current) => ({ ...current, name }))}
            id="edit-list-name"
          />
          <CheckListScheduleFields
            form={editForm}
            onChange={setEditForm}
            idPrefix="edit"
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={closeEditDialog} disabled={savingEdit}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingEdit}>
              {savingEdit ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </OperationDialog>

      <OperationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={
          deleteTarget?.kind === 'daily'
            ? 'Remove daily plan'
            : deleteTarget && isPeriodicList(deleteTarget)
              ? 'Remove periodic plan'
              : 'Remove list'
        }
        description={deleteTarget ? deleteListDescription(deleteTarget) : undefined}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={() => void handleDeleteList()}
          >
            {deleting ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </OperationDialog>
    </div>
  )
}
