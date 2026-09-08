import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useEffect } from 'react'

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
  fetchMe,
  fetchMyInvites,
  fetchNotes,
  fetchTodoLists,
  fetchTodos,
  fetchWorkspaceAccessRequests,
  fetchWorkspaceMembers,
  fetchWorkspaces,
} from '@/lib/api'
import { queryKeys } from '@/lib/queries/keys'
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

export function useTodosQuery(workspaceId: number | null, listId?: number | null, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.todos(workspaceId ?? 0, listId),
    queryFn: () => fetchTodos(token!, workspaceId!, listId ?? undefined),
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

export function usePlannerDayQuery(workspaceId: number | null, date: string, enabled = true) {
  const token = useAuthStore((state) => state.token)

  return useQuery({
    queryKey: queryKeys.plannerDay(workspaceId ?? 0, date),
    enabled: Boolean(token && workspaceId && date && enabled),
    queryFn: async () => {
      const daily = await ensureDailyList(token!, workspaceId!, date)
      const [checkListData, noteData] = await Promise.all([
        fetchTodos(token!, workspaceId!, daily.list_id),
        fetchNotes(token!, workspaceId!, daily.list_id),
      ])
      return {
        dailyListId: daily.list_id,
        items: checkListData.todos,
        notes: noteData.notes,
      }
    },
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
  sections: { bills?: boolean; events?: boolean; expenses?: boolean } = {},
) {
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.token)
  const { bills = true, events = true, expenses = true } = sections

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

    if (expenses) {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.expenses(workspaceId),
        queryFn: () => fetchExpenses(token, workspaceId),
      })
    }
  }, [enabled, token, workspaceId, queryClient, bills, events, expenses])
}
