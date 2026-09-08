import type { QueryClient } from '@tanstack/react-query'

import { queryKeys } from '@/lib/queries/keys'

export type CheckListTodoScope = {
  listId: number
  occurrence?: string | null
  plannerWeek?: { start: string; end: string }
  plannerDay?: string
}

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
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['planner-week', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['planner-day', workspaceId] }),
      ])
    case 'note':
      return queryClient.invalidateQueries({ queryKey: ['notes', workspaceId] })
    case 'todo_list':
      return invalidateCheckListCatalog(queryClient, workspaceId)
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

export function invalidateCheckListCatalog(queryClient: QueryClient, workspaceId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['todo-lists', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['planner-week', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['planner-day', workspaceId] }),
  ])
}

export function invalidateCheckListTodos(
  queryClient: QueryClient,
  workspaceId: number,
  scope: CheckListTodoScope,
) {
  const tasks: Promise<void>[] = [
    queryClient.invalidateQueries({
      queryKey: queryKeys.todos(workspaceId, scope.listId, scope.occurrence ?? null),
    }),
  ]

  if (scope.plannerWeek) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: queryKeys.plannerWeek(
          workspaceId,
          scope.plannerWeek.start,
          scope.plannerWeek.end,
        ),
      }),
    )
  }

  if (scope.plannerDay) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: queryKeys.plannerDay(workspaceId, scope.plannerDay),
      }),
    )
  }

  return Promise.all(tasks)
}

/** @deprecated Prefer invalidateCheckListCatalog or invalidateCheckListTodos */
export function invalidateCheckLists(queryClient: QueryClient, workspaceId: number) {
  return invalidateCheckListCatalog(queryClient, workspaceId)
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
  ])
}
