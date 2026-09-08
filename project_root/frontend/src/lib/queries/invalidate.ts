import type { QueryClient } from '@tanstack/react-query'

import { queryKeys } from '@/lib/queries/keys'

export function invalidateWorkspaceEntity(
  queryClient: QueryClient,
  workspaceId: number,
  entity?: string,
) {
  switch (entity) {
    case 'event':
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['events', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['event-series', workspaceId] }),
      ])
    case 'income':
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['income', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['income-series', workspaceId] }),
      ])
    case 'bill':
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bills', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['bill-series', workspaceId] }),
      ])
    case 'expense':
      return queryClient.invalidateQueries({ queryKey: ['expenses', workspaceId] })
    case 'todo':
      return queryClient.invalidateQueries({ queryKey: ['todos', workspaceId] })
    case 'note':
      return queryClient.invalidateQueries({ queryKey: ['notes', workspaceId] })
    case 'todo_list':
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['todo-lists', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['daily-list', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['planner-day', workspaceId] }),
      ])
    case 'chat':
    case 'chat_message':
    case 'message':
      return queryClient.invalidateQueries({ queryKey: ['chat-conversations', workspaceId] })
    case 'workspace':
      return queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() })
    case 'user_profile':
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations(workspaceId) }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === 'chat-messages' && query.queryKey[1] === workspaceId,
        }),
      ])
    default:
      return queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return key.includes(workspaceId)
        },
      })
  }
}

export function invalidateCheckLists(queryClient: QueryClient, workspaceId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['todo-lists', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['daily-list', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['todos', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['notes', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['planner-day', workspaceId] }),
  ])
}

export function invalidatePlannerFinance(queryClient: QueryClient, workspaceId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['events', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['event-series', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['income', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['income-series', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['bills', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['bill-series', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['expenses', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['finance-summary', workspaceId] }),
  ])
}

export function invalidatePlannerDay(queryClient: QueryClient, workspaceId: number, date: string) {
  return Promise.all([
    invalidatePlannerFinance(queryClient, workspaceId),
    queryClient.invalidateQueries({ queryKey: queryKeys.plannerDay(workspaceId, date) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.todos(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.notes(workspaceId) }),
  ])
}
