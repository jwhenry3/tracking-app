import type {
  Bill,
  ChatConversation,
  ChatMessage,
  CreateWorkspaceResult,
  Expense,
  FinanceSummary,
  IncomeEntry,
  Note,
  PlannerEvent,
  Todo,
  TodoList,
  Workspace,
  WorkspaceAccessRequest,
  WorkspaceInvite,
  WorkspaceMember,
} from '@/lib/types'
import type { OccurrenceScope } from '@/lib/recurrence'
import { parseOccurrenceId } from '@/lib/recurrence'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

type ApiError = { error?: string }

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (!response.ok) {
    let message = 'Request failed'
    try {
      const data = (await response.json()) as ApiError
      message = data.error ?? message
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function register(username: string, password: string, workspaceName?: string) {
  return request<{ token: string; username: string }>('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, workspace_name: workspaceName }),
  })
}

export async function login(username: string, password: string) {
  return request<{ token: string; username: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function fetchMe(token: string) {
  return request<{ id: number; username: string }>('/api/me', {}, token)
}

export async function fetchWorkspaces(token: string) {
  return request<{ workspaces: Workspace[] }>('/api/workspaces', {}, token)
}

export async function createWorkspace(token: string, name: string, message?: string) {
  return request<CreateWorkspaceResult>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name, message }),
  }, token)
}

export async function fetchWorkspaceMembers(token: string, workspaceId: number) {
  return request<{ members: WorkspaceMember[] }>(
    `/api/workspaces/${workspaceId}/members`,
    {},
    token,
  )
}

export async function inviteWorkspaceMember(token: string, workspaceId: number, username: string) {
  return request<{ message: string }>(
    `/api/workspaces/${workspaceId}/invites`,
    { method: 'POST', body: JSON.stringify({ username }) },
    token,
  )
}

export async function fetchWorkspaceAccessRequests(token: string, workspaceId: number) {
  return request<{ requests: WorkspaceAccessRequest[] }>(
    `/api/workspaces/${workspaceId}/access-requests`,
    {},
    token,
  )
}

export async function reviewWorkspaceAccessRequest(
  token: string,
  workspaceId: number,
  requestId: number,
  action: 'approve' | 'deny',
) {
  return request<{ message: string; status: string }>(
    `/api/workspaces/${workspaceId}/access-requests/${requestId}`,
    { method: 'PATCH', body: JSON.stringify({ action }) },
    token,
  )
}

export async function fetchMyInvites(token: string) {
  return request<{ invites: WorkspaceInvite[] }>('/api/invites', {}, token)
}

export async function acceptInvite(token: string, inviteId: number) {
  return request<{ message: string; workspace: Workspace }>(
    `/api/invites/${inviteId}/accept`,
    { method: 'POST' },
    token,
  )
}

export async function declineInvite(token: string, inviteId: number) {
  return request<{ message: string }>(
    `/api/invites/${inviteId}/decline`,
    { method: 'POST' },
    token,
  )
}

export async function fetchChatConversations(token: string, workspaceId: number) {
  return request<{ conversations: ChatConversation[] }>(
    `/api/workspaces/${workspaceId}/chat/conversations`,
    {},
    token,
  )
}

export async function fetchChatMessages(token: string, workspaceId: number, conversationId: number) {
  return request<{ messages: ChatMessage[] }>(
    `/api/workspaces/${workspaceId}/chat/conversations/${conversationId}/messages`,
    {},
    token,
  )
}

export async function sendChatMessage(
  token: string,
  workspaceId: number,
  conversationId: number,
  content: string,
) {
  return request<ChatMessage>(
    `/api/workspaces/${workspaceId}/chat/conversations/${conversationId}/messages`,
    { method: 'POST', body: JSON.stringify({ content }) },
    token,
  )
}

export async function createDirectConversation(token: string, workspaceId: number, username: string) {
  return request<ChatConversation>(
    `/api/workspaces/${workspaceId}/chat/direct`,
    { method: 'POST', body: JSON.stringify({ username }) },
    token,
  )
}

export async function addWorkspaceMember(token: string, workspaceId: number, username: string) {
  return inviteWorkspaceMember(token, workspaceId, username)
}

export async function fetchEvents(token: string, workspaceId: number, start?: string, end?: string) {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const query = params.toString() ? `?${params.toString()}` : ''
  return request<{ events: PlannerEvent[] }>(
    `/api/workspaces/${workspaceId}/events${query}`,
    {},
    token,
  )
}

export async function createEvent(
  token: string,
  workspaceId: number,
  payload: {
    title: string
    description?: string
    start_at: string
    end_at: string
    all_day?: boolean
    color?: string
    recurrence?: string
  },
) {
  return request<PlannerEvent>(
    `/api/workspaces/${workspaceId}/events`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}

export async function deleteEvent(
  token: string,
  workspaceId: number,
  event: Pick<PlannerEvent, 'series_id' | 'occurrence_id' | 'is_recurring'>,
  scope: OccurrenceScope = 'all',
) {
  const { occurrenceAt } = parseOccurrenceId(event.occurrence_id)
  const params = new URLSearchParams()
  if (event.is_recurring && scope !== 'all') {
    params.set('scope', scope)
    params.set('occurrence', occurrenceAt)
  } else {
    params.set('scope', 'all')
  }
  return request<void>(
    `/api/workspaces/${workspaceId}/events/${event.series_id}?${params.toString()}`,
    { method: 'DELETE' },
    token,
  )
}

export async function patchEventOccurrence(
  token: string,
  workspaceId: number,
  event: Pick<PlannerEvent, 'series_id' | 'occurrence_id'>,
  payload: {
    scope: OccurrenceScope
    title?: string
    description?: string
    start_at?: string
    end_at?: string
    recurrence?: string
  },
) {
  const { occurrenceAt } = parseOccurrenceId(event.occurrence_id)
  return request<void>(
    `/api/workspaces/${workspaceId}/events/${event.series_id}/occurrences/${encodeURIComponent(occurrenceAt)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token,
  )
}

export async function fetchFinanceSummary(token: string, workspaceId: number, start?: string, end?: string) {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const query = params.toString() ? `?${params.toString()}` : ''
  return request<FinanceSummary>(`/api/workspaces/${workspaceId}/finance/summary${query}`, {}, token)
}

export async function fetchIncome(token: string, workspaceId: number, start?: string, end?: string) {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const query = params.toString() ? `?${params.toString()}` : ''
  return request<{ income: IncomeEntry[] }>(
    `/api/workspaces/${workspaceId}/finance/income${query}`,
    {},
    token,
  )
}

export async function createIncome(
  token: string,
  workspaceId: number,
  payload: { title: string; amount: number; date: string; notes?: string; recurrence?: string },
) {
  return request<IncomeEntry>(
    `/api/workspaces/${workspaceId}/finance/income`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}

export async function fetchBills(token: string, workspaceId: number, start?: string, end?: string) {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const query = params.toString() ? `?${params.toString()}` : ''
  return request<{ bills: Bill[] }>(`/api/workspaces/${workspaceId}/finance/bills${query}`, {}, token)
}

export async function createBill(
  token: string,
  workspaceId: number,
  payload: { title: string; amount: number; date: string; category?: string; recurrence?: string },
) {
  return request<Bill>(
    `/api/workspaces/${workspaceId}/finance/bills`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}

export async function patchBillOccurrence(
  token: string,
  workspaceId: number,
  bill: Pick<Bill, 'series_id' | 'occurrence_id'>,
  payload: {
    scope: OccurrenceScope
    paid?: boolean
    paid_at?: string
    skipped?: boolean
    payment_notes?: string
    amount?: number
    title?: string
    date?: string
    category?: string
    recurrence?: string
  },
) {
  const { occurrenceAt } = parseOccurrenceId(bill.occurrence_id)
  return request<void>(
    `/api/workspaces/${workspaceId}/finance/bills/${bill.series_id}/occurrences/${encodeURIComponent(occurrenceAt)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token,
  )
}

export async function payBillOccurrence(
  token: string,
  workspaceId: number,
  bill: Pick<Bill, 'series_id' | 'occurrence_id' | 'is_recurring' | 'amount'>,
  payload: { paid: boolean; paid_at?: string; amount?: number; payment_notes?: string },
) {
  return patchBillOccurrence(token, workspaceId, bill, {
    scope: bill.is_recurring ? 'this' : 'all',
    paid: payload.paid,
    paid_at: payload.paid_at,
    amount: payload.amount,
    payment_notes: payload.payment_notes,
    skipped: payload.paid ? false : undefined,
  })
}

export async function skipBillOccurrence(
  token: string,
  workspaceId: number,
  bill: Pick<Bill, 'series_id' | 'occurrence_id' | 'is_recurring'>,
  payload: { payment_notes?: string } = {},
) {
  return patchBillOccurrence(token, workspaceId, bill, {
    scope: bill.is_recurring ? 'this' : 'all',
    skipped: true,
    paid: false,
    payment_notes: payload.payment_notes,
  })
}

export async function patchIncomeOccurrence(
  token: string,
  workspaceId: number,
  income: Pick<IncomeEntry, 'series_id' | 'occurrence_id'>,
  payload: {
    scope: OccurrenceScope
    title?: string
    amount?: number
    date?: string
    notes?: string
    recurrence?: string
  },
) {
  const { occurrenceAt } = parseOccurrenceId(income.occurrence_id)
  return request<void>(
    `/api/workspaces/${workspaceId}/finance/income/${income.series_id}/occurrences/${encodeURIComponent(occurrenceAt)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token,
  )
}

export async function fetchExpenses(token: string, workspaceId: number) {
  return request<{ expenses: Expense[] }>(
    `/api/workspaces/${workspaceId}/finance/expenses`,
    {},
    token,
  )
}

export async function createExpense(
  token: string,
  workspaceId: number,
  payload: { title: string; amount: number; date: string; category?: string; notes?: string },
) {
  return request<Expense>(
    `/api/workspaces/${workspaceId}/finance/expenses`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}

export async function deleteIncome(
  token: string,
  workspaceId: number,
  income: Pick<IncomeEntry, 'series_id' | 'occurrence_id' | 'is_recurring'>,
  scope: OccurrenceScope = 'all',
) {
  const { occurrenceAt } = parseOccurrenceId(income.occurrence_id)
  const params = new URLSearchParams()
  if (income.is_recurring && scope !== 'all') {
    params.set('scope', scope)
    params.set('occurrence', occurrenceAt)
  } else {
    params.set('scope', 'all')
  }
  return request<void>(
    `/api/workspaces/${workspaceId}/finance/income/${income.series_id}?${params.toString()}`,
    { method: 'DELETE' },
    token,
  )
}

export async function deleteBill(
  token: string,
  workspaceId: number,
  bill: Pick<Bill, 'series_id' | 'occurrence_id' | 'is_recurring'>,
  scope: OccurrenceScope = 'all',
) {
  const { occurrenceAt } = parseOccurrenceId(bill.occurrence_id)
  const params = new URLSearchParams()
  if (bill.is_recurring && scope !== 'all') {
    params.set('scope', scope)
    params.set('occurrence', occurrenceAt)
  } else {
    params.set('scope', 'all')
  }
  return request<void>(
    `/api/workspaces/${workspaceId}/finance/bills/${bill.series_id}?${params.toString()}`,
    { method: 'DELETE' },
    token,
  )
}

export async function patchExpense(
  token: string,
  workspaceId: number,
  expenseId: number,
  payload: {
    title?: string
    amount?: number
    date?: string
    category?: string
    notes?: string
    paid?: boolean
    paid_at?: string
    skipped?: boolean
    payment_notes?: string
  },
) {
  return request<void>(
    `/api/workspaces/${workspaceId}/finance/expenses/${expenseId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token,
  )
}

export async function payExpense(
  token: string,
  workspaceId: number,
  expense: Pick<Expense, 'id' | 'amount'>,
  payload: { paid: boolean; paid_at?: string; amount?: number; payment_notes?: string },
) {
  return patchExpense(token, workspaceId, expense.id, {
    paid: payload.paid,
    paid_at: payload.paid_at,
    amount: payload.amount,
    payment_notes: payload.payment_notes,
    skipped: payload.paid ? false : undefined,
  })
}

export async function skipExpense(
  token: string,
  workspaceId: number,
  expense: Pick<Expense, 'id'>,
  payload: { payment_notes?: string } = {},
) {
  return patchExpense(token, workspaceId, expense.id, {
    skipped: true,
    paid: false,
    payment_notes: payload.payment_notes,
  })
}

export async function deleteExpense(token: string, workspaceId: number, expenseId: number) {
  return request<void>(
    `/api/workspaces/${workspaceId}/finance/expenses/${expenseId}`,
    { method: 'DELETE' },
    token,
  )
}

export async function fetchTodoLists(token: string, workspaceId: number, date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  return request<{ lists: TodoList[] }>(
    `/api/workspaces/${workspaceId}/todo-lists${query}`,
    {},
    token,
  )
}

export async function ensureDailyList(token: string, workspaceId: number, date: string) {
  return request<{ list_id: number; date: string }>(
    `/api/workspaces/${workspaceId}/todo-lists/daily/${date}`,
    {},
    token,
  )
}

export async function createTodoList(
  token: string,
  workspaceId: number,
  payload: { name: string; kind?: string; list_date?: string },
) {
  return request<TodoList>(
    `/api/workspaces/${workspaceId}/todo-lists`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}

export async function fetchTodos(token: string, workspaceId: number, listId?: number) {
  const query = listId ? `?list_id=${listId}` : ''
  return request<{ todos: Todo[] }>(
    `/api/workspaces/${workspaceId}/todos${query}`,
    {},
    token,
  )
}

export async function createTodo(
  token: string,
  workspaceId: number,
  payload: { list_id: number; title: string; due_date?: string },
) {
  return request<Todo>(
    `/api/workspaces/${workspaceId}/todos`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}

export async function updateTodo(
  token: string,
  workspaceId: number,
  todoId: number,
  payload: { title?: string; completed?: boolean },
) {
  return request<{ message: string }>(
    `/api/workspaces/${workspaceId}/todos/${todoId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token,
  )
}

export async function fetchNotes(token: string, workspaceId: number, listId?: number) {
  const query = listId ? `?list_id=${listId}` : ''
  return request<{ notes: Note[] }>(
    `/api/workspaces/${workspaceId}/notes${query}`,
    {},
    token,
  )
}

export async function createNote(
  token: string,
  workspaceId: number,
  payload: { title: string; content: string; list_id?: number },
) {
  return request<Note>(
    `/api/workspaces/${workspaceId}/notes`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}

export function getWebSocketUrl(token: string, workspaceId: number) {
  const apiUrl = new URL(API_URL)
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  apiUrl.pathname = '/ws'
  apiUrl.search = `token=${encodeURIComponent(token)}&workspace_id=${workspaceId}`
  apiUrl.hash = ''
  return apiUrl.toString()
}

export { API_URL }
