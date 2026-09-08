export const queryKeys = {
  me: () => ['me'] as const,
  workspaces: () => ['workspaces'] as const,
  workspaceMembers: (workspaceId: number) => ['workspace-members', workspaceId] as const,
  workspaceAccessRequests: (workspaceId: number) => ['workspace-access-requests', workspaceId] as const,
  myInvites: () => ['my-invites'] as const,
  events: (workspaceId: number, start?: string, end?: string) =>
    ['events', workspaceId, start ?? null, end ?? null] as const,
  income: (workspaceId: number, start?: string, end?: string) =>
    ['income', workspaceId, start ?? null, end ?? null] as const,
  incomeSeries: (workspaceId: number) => ['income-series', workspaceId] as const,
  bills: (workspaceId: number, start?: string, end?: string) =>
    ['bills', workspaceId, start ?? null, end ?? null] as const,
  billSeries: (workspaceId: number, status?: string) =>
    ['bill-series', workspaceId, status ?? 'active'] as const,
  eventSeries: (workspaceId: number) => ['event-series', workspaceId] as const,
  expenses: (workspaceId: number) => ['expenses', workspaceId] as const,
  financeSummary: (workspaceId: number, start?: string, end?: string) =>
    ['finance-summary', workspaceId, start ?? null, end ?? null] as const,
  todoLists: (workspaceId: number, date?: string) =>
    ['todo-lists', workspaceId, date ?? null] as const,
  dailyList: (workspaceId: number, date: string) => ['daily-list', workspaceId, date] as const,
  todos: (workspaceId: number, listId?: number | null) =>
    ['todos', workspaceId, listId ?? null] as const,
  notes: (workspaceId: number, listId?: number | null) =>
    ['notes', workspaceId, listId ?? null] as const,
  plannerDay: (workspaceId: number, date: string) => ['planner-day', workspaceId, date] as const,
  chatConversations: (workspaceId: number) => ['chat-conversations', workspaceId] as const,
  chatMessages: (workspaceId: number, conversationId: number) =>
    ['chat-messages', workspaceId, conversationId] as const,
}
