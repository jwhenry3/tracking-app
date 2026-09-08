import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useEffect, useMemo } from 'react'

import {
  ensureDailyList,
  fetchBillSeries,
  fetchBills,
  fetchChatConversations,
  fetchChatMessages,
  fetchEvents,
  fetchEventSeries,
  fetchExpenses,
  fetchFinanceSummary,
  fetchIncome,
  fetchIncomeSeries,
  fetchMe,
  fetchMyInvites,
  fetchNotes,
  fetchTodoLists,
  fetchTodos,
  fetchWorkspaceAccessRequests,
  fetchWorkspaceMembers,
  fetchWorkspaces,
} from '@/lib/api'
import { daysInListSpan, isPeriodicList, listPeriodScope } from '@/lib/checklistPeriods'
import { normalizeFinanceDate } from '@/lib/financeUtils'
import { queryKeys } from '@/lib/queries/keys'
import type { CalendarFocusFilter } from '@/lib/calendarFocusFilter'
import type { CentralCalendarItem } from '@/lib/calendarTypes'
import type { Todo, TodoList } from '@/lib/types'
import { isInRange, matchesCalendarItem } from '@/lib/calendarUtils'
import type { Workspace } from '@/lib/types'
import { workspaceHasFocus } from '@/lib/workspaceFocus'
import { useAuthStore } from '@/stores/authStore'

export function useWorkspaceParams() {
  const { workspaceId } = useParams()
  const token = useAuthStore((state) => state.token)
  const numericWorkspaceId = workspaceId ? Number(workspaceId) : null

  return {
    token,
    workspaceId: numericWorkspaceId,
    enabled: Boolean(token && numericWorkspaceId && !Number.isNaN(numericWorkspaceId)),
  }
}

export function useMeQuery() {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => fetchMe(token!),
    enabled: Boolean(token),
  })
}

export function useWorkspacesQuery() {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: () => fetchWorkspaces(token!),
    enabled: Boolean(token),
  })
}

export function useWorkspaceMembersQuery(workspaceId?: number | null) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId ?? 0),
    queryFn: () => fetchWorkspaceMembers(token!, workspaceId!),
    enabled: Boolean(token && workspaceId),
  })
}

export function useWorkspaceAccessRequestsQuery(workspaceId?: number | null) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.workspaceAccessRequests(workspaceId ?? 0),
    queryFn: () => fetchWorkspaceAccessRequests(token!, workspaceId!),
    enabled: Boolean(token && workspaceId),
  })
}

export function useMyInvitesQuery() {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.myInvites(),
    queryFn: () => fetchMyInvites(token!),
    enabled: Boolean(token),
  })
}

export function useEventsQuery(workspaceId: number | null, start?: string, end?: string, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.events(workspaceId ?? 0, start, end),
    queryFn: () => fetchEvents(token!, workspaceId!, start, end),
    enabled: Boolean(token && workspaceId && enabled),
    select: (data) => data.events,
  })
}

export function useIncomeQuery(workspaceId: number | null, start?: string, end?: string, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.income(workspaceId ?? 0, start, end),
    queryFn: () => fetchIncome(token!, workspaceId!, start, end),
    enabled: Boolean(token && workspaceId && enabled),
    select: (data) => data.income,
  })
}

export function useBillsQuery(workspaceId: number | null, start?: string, end?: string, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.bills(workspaceId ?? 0, start, end),
    queryFn: () => fetchBills(token!, workspaceId!, start, end),
    enabled: Boolean(token && workspaceId && enabled),
    select: (data) => data.bills,
  })
}

export function useBillSeriesQuery(
  workspaceId: number | null,
  status: 'active' | 'paid_off' | 'all' = 'active',
  enabled = true,
) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.billSeries(workspaceId ?? 0, status),
    queryFn: () => fetchBillSeries(token!, workspaceId!, status),
    enabled: Boolean(token && workspaceId && enabled),
    select: (data) => data.bills,
  })
}

export function useEventSeriesQuery(workspaceId: number | null, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.eventSeries(workspaceId ?? 0),
    queryFn: () => fetchEventSeries(token!, workspaceId!),
    enabled: Boolean(token && workspaceId && enabled),
    select: (data) => data.events,
  })
}

export function useExpensesQuery(workspaceId: number | null, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.expenses(workspaceId ?? 0),
    queryFn: () => fetchExpenses(token!, workspaceId!),
    enabled: Boolean(token && workspaceId && enabled),
    select: (data) => data.expenses,
  })
}

export function useIncomeSeriesQuery(workspaceId: number | null, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.incomeSeries(workspaceId ?? 0),
    queryFn: () => fetchIncomeSeries(token!, workspaceId!),
    enabled: Boolean(token && workspaceId && enabled),
    select: (data) => data.income,
  })
}

export function useFinanceSummaryQuery(
  workspaceId: number | null,
  start?: string,
  end?: string,
  enabled = true,
) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.financeSummary(workspaceId ?? 0, start, end),
    queryFn: () => fetchFinanceSummary(token!, workspaceId!, start, end),
    enabled: Boolean(token && workspaceId && enabled),
  })
}

export function useTodoListsQuery(workspaceId: number | null, date?: string, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.todoLists(workspaceId ?? 0, date),
    queryFn: () => fetchTodoLists(token!, workspaceId!, date),
    enabled: Boolean(token && workspaceId && enabled),
    select: (data) => data.lists,
  })
}

export function useDailyListQuery(workspaceId: number | null, date: string, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.dailyList(workspaceId ?? 0, date),
    queryFn: () => ensureDailyList(token!, workspaceId!, date),
    enabled: Boolean(token && workspaceId && date && enabled),
  })
}

export function useTodosQuery(
  workspaceId: number | null,
  listId?: number | null,
  enabled = true,
  occurrence?: string | null,
) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.todos(workspaceId ?? 0, listId, occurrence),
    queryFn: () => fetchTodos(token!, workspaceId!, listId ?? undefined, occurrence ?? undefined),
    enabled: Boolean(token && workspaceId && listId && enabled),
    select: (data) => data.todos,
  })
}

export function useNotesQuery(workspaceId: number | null, listId?: number | null, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.notes(workspaceId ?? 0, listId),
    queryFn: () => fetchNotes(token!, workspaceId!, listId ?? undefined),
    enabled: Boolean(token && workspaceId && listId && enabled),
    select: (data) => data.notes,
  })
}

export type PlannerDayListData = {
  id: number
  name: string
  kind: TodoList['kind']
  periodScope: ReturnType<typeof listPeriodScope>
  isRecurring: boolean
  occurrenceDate: string | null
  items: Todo[]
}

export type PlannerDayData = {
  dailyListId: number | null
  dailyLists: PlannerDayListData[]
  items: Todo[]
}

async function buildPlannerListEntries(
  token: string,
  workspaceId: number,
  lists: TodoList[],
  todoCache: Map<string, Todo[]>,
) {
  return Promise.all(
    lists.map(async (list) => {
      const occurrence = list.list_date ?? undefined
      const cacheKey = `${list.id}:${occurrence ?? ''}`
      if (!todoCache.has(cacheKey)) {
        const checkListData = await fetchTodos(token, workspaceId, list.id, occurrence)
        todoCache.set(cacheKey, checkListData.todos)
      }
      return {
        id: list.id,
        name: list.name,
        kind: list.kind,
        periodScope: listPeriodScope(list),
        isRecurring: Boolean(list.is_recurring),
        occurrenceDate: occurrence ?? null,
        items: todoCache.get(cacheKey) ?? [],
      }
    }),
  )
}

export async function fetchPlannerDayData(
  token: string,
  workspaceId: number,
  date: string,
): Promise<PlannerDayData> {
  await ensureDailyList(token, workspaceId, date)
  const listsResponse = await fetchTodoLists(token, workspaceId, date)
  const plannerLists = listsResponse.lists.filter(
    (list) => list.kind === 'daily' || isPeriodicList(list),
  )

  const todoCache = new Map<string, Todo[]>()
  const listData = await buildPlannerListEntries(token, workspaceId, plannerLists, todoCache)
  const primaryList = listData[0]

  return {
    dailyListId: primaryList?.id ?? null,
    dailyLists: listData,
    items: primaryList?.items ?? [],
  }
}

export async function fetchPlannerWeekData(
  token: string,
  workspaceId: number,
  days: string[],
): Promise<Record<string, PlannerDayData>> {
  if (days.length === 0) return {}

  const start = days[0]
  const end = days[days.length - 1]
  const byDay: Record<string, PlannerDayData> = {}
  for (const day of days) {
    byDay[day] = { dailyListId: null, dailyLists: [], items: [] }
  }

  const listsResponse = await fetchTodoLists(token, workspaceId, { start, end })
  const plannerLists = listsResponse.lists.filter(
    (list) => list.kind === 'daily' || isPeriodicList(list),
  )

  const todoCache = new Map<string, Todo[]>()
  const listEntries = await buildPlannerListEntries(token, workspaceId, plannerLists, todoCache)

  listEntries.forEach((entry, index) => {
    const list = plannerLists[index]
    const targetDays = daysInListSpan(list, days)

    for (const day of targetDays) {
      byDay[day]?.dailyLists.push(entry)
    }
  })

  for (const day of days) {
    const dayData = byDay[day]
    dayData.dailyListId = dayData.dailyLists[0]?.id ?? null
    dayData.items = dayData.dailyLists[0]?.items ?? []
  }

  return byDay
}

export function usePlannerDayQuery(workspaceId: number | null, date: string, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.plannerDay(workspaceId ?? 0, date),
    enabled: Boolean(token && workspaceId && date && enabled),
    queryFn: () => fetchPlannerDayData(token!, workspaceId!, date),
    staleTime: 0,
  })
}

export function usePlannerWeekQuery(workspaceId: number | null, days: string[], enabled = true) {
  const token = useAuthStore((state) => state.token)
  const start = days[0] ?? ''
  const end = days[days.length - 1] ?? ''

  return useQuery({
    queryKey: queryKeys.plannerWeek(workspaceId ?? 0, start, end),
    enabled: Boolean(token && workspaceId && days.length > 0 && enabled),
    queryFn: () => fetchPlannerWeekData(token!, workspaceId!, days),
    staleTime: 0,
  })
}

export function useChatConversationsQuery(workspaceId: number | null, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.chatConversations(workspaceId ?? 0),
    queryFn: () => fetchChatConversations(token!, workspaceId!),
    enabled: Boolean(token && workspaceId && enabled),
    select: (data) => data.conversations,
  })
}

export function useChatMessagesQuery(
  workspaceId: number | null,
  conversationId: number | null,
  enabled = true,
) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.chatMessages(workspaceId ?? 0, conversationId ?? 0),
    queryFn: () => fetchChatMessages(token!, workspaceId!, conversationId!),
    enabled: Boolean(token && workspaceId && conversationId && enabled),
    select: (data) => data.messages,
  })
}

export function usePrefetchManageQueries(
  workspaceId: number | null,
  enabled = true,
  sections: { bills?: boolean; events?: boolean; expenses?: boolean; income?: boolean } = {},
) {
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.token)
  const { bills = true, events = true, expenses = true, income = true } = sections

  useEffect(() => {
    if (!enabled || !token || !workspaceId) return

    if (bills) {
      const billStatuses = ['active', 'paid_off'] as const
      for (const status of billStatuses) {
        void queryClient.prefetchQuery({
          queryKey: queryKeys.billSeries(workspaceId, status),
          queryFn: () => fetchBillSeries(token, workspaceId, status),
        })
      }
    }

    if (events) {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.eventSeries(workspaceId),
        queryFn: () => fetchEventSeries(token, workspaceId),
      })
    }

    if (income) {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.incomeSeries(workspaceId),
        queryFn: () => fetchIncomeSeries(token, workspaceId),
      })
    }

    if (expenses) {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.expenses(workspaceId),
        queryFn: () => fetchExpenses(token, workspaceId),
      })
    }
  }, [enabled, token, workspaceId, queryClient, bills, events, expenses, income])
}

export function useCentralCalendarData(
  workspaces: Workspace[],
  range: { start: string; end: string },
  focusFilter: CalendarFocusFilter,
  selectedWorkspaceIds?: number[],
) {
  const token = useAuthStore((state) => state.token)

  const visibleWorkspaces = useMemo(() => {
    if (!selectedWorkspaceIds || selectedWorkspaceIds.length === 0) {
      return workspaces
    }
    const allowed = new Set(selectedWorkspaceIds)
    return workspaces.filter((workspace) => allowed.has(workspace.id))
  }, [workspaces, selectedWorkspaceIds])

  const enabled = Boolean(token && visibleWorkspaces.length)

  const planningWorkspaces = visibleWorkspaces.filter(
    (workspace) => workspaceHasFocus(workspace, 'planning') && focusFilter.events,
  )
  const financeWorkspaces = visibleWorkspaces.filter(
    (workspace) => workspaceHasFocus(workspace, 'finances') && focusFilter.finances,
  )

  const eventQueries = useQueries({
    queries: planningWorkspaces.map((workspace) => ({
      queryKey: queryKeys.events(workspace.id, range.start, range.end),
      queryFn: () => fetchEvents(token!, workspace.id, range.start, range.end),
      enabled,
    })),
  })

  const incomeQueries = useQueries({
    queries: financeWorkspaces.map((workspace) => ({
      queryKey: queryKeys.income(workspace.id, range.start, range.end),
      queryFn: () => fetchIncome(token!, workspace.id, range.start, range.end),
      enabled,
    })),
  })

  const billQueries = useQueries({
    queries: financeWorkspaces.map((workspace) => ({
      queryKey: queryKeys.bills(workspace.id, range.start, range.end),
      queryFn: () => fetchBills(token!, workspace.id, range.start, range.end),
      enabled,
    })),
  })

  const expenseQueries = useQueries({
    queries: financeWorkspaces.map((workspace) => ({
      queryKey: queryKeys.expenses(workspace.id),
      queryFn: () => fetchExpenses(token!, workspace.id),
      enabled,
    })),
  })

  const calendarItems = useMemo(() => {
    const items: CentralCalendarItem[] = []

    planningWorkspaces.forEach((workspace, index) => {
      const events = eventQueries[index]?.data?.events ?? []
      for (const event of events) {
        items.push({
          ...event,
          kind: 'event',
          date: event.start_at.slice(0, 10),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        })
      }
    })

    financeWorkspaces.forEach((workspace, index) => {
      const income = incomeQueries[index]?.data?.income ?? []
      for (const item of income) {
        items.push({
          ...item,
          kind: 'income',
          date: normalizeFinanceDate(item.entry_date),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        })
      }

      const bills = billQueries[index]?.data?.bills ?? []
      for (const item of bills) {
        items.push({
          ...item,
          kind: 'bill',
          date: normalizeFinanceDate(item.due_date),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        })
      }

      const expenses = (expenseQueries[index]?.data?.expenses ?? []).filter((expense) =>
        isInRange(normalizeFinanceDate(expense.expense_date), range.start, range.end),
      )
      for (const item of expenses) {
        items.push({
          ...item,
          kind: 'expense',
          date: normalizeFinanceDate(item.expense_date),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        })
      }
    })

    return items.filter((item) => matchesCalendarItem(item, focusFilter))
  }, [
    planningWorkspaces,
    financeWorkspaces,
    eventQueries,
    incomeQueries,
    billQueries,
    expenseQueries,
    range.end,
    range.start,
    focusFilter,
  ])

  const isLoading =
    eventQueries.some((query) => query.isLoading) ||
    incomeQueries.some((query) => query.isLoading) ||
    billQueries.some((query) => query.isLoading) ||
    expenseQueries.some((query) => query.isLoading)

  return {
    calendarItems,
    isLoading,
  }
}
