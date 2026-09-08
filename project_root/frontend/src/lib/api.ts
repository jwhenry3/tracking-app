import type {
  Bill,
  BillSeries,
  ChatConversation,
  ChatMessage,
  CreateWorkspaceResult,
  Expense,
  EventSeries,
  FinanceSummary,
  IncomeEntry,
  IncomeSeries,
  Note,
  PlannerEvent,
  Todo,
  TodoList,
  User,
  Workspace,
  WorkspaceAccessRequest,
  WorkspaceFocusArea,
  WorkspaceInvite,
  WorkspaceMember,
} from '@/lib/types'
import type { OccurrenceScope } from '@/lib/recurrence'
import { parseOccurrenceId } from '@/lib/recurrence'

const API_URL = resolveApiUrl()

function resolveApiUrl() {
  const configured = import.meta.env.VITE_API_URL
  if (configured == null || configured === '') {
    return import.meta.env.DEV ? 'http://localhost:8080' : ''
  }
  return String(configured).replace(/\/$/, '')
}

type ApiError = { error?: string }

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
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

export async function register(
  username: string,
  password: string,
  workspaceName?: string,
  email?: string,
) {
  return request<{ token: string; username: string }>('/api/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      workspace_name: workspaceName,
      email: email || undefined,
    }),
  })
}

export async function login(username: string, password: string) {
  return request<{ token: string; username: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function requestPasswordReset(email: string) {
  return request<{ message: string }>('/api/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(token: string, password: string) {
  return request<{ message: string }>('/api/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export async function fetchMe(token: string) {
  return request<User>('/api/me', {}, token)
}

export async function updateProfileSettings(
  token: string,
  payload: {
    username?: string
    email?: string | null
    display_name?: string | null
    settings?: Record<string, unknown>
  },
) {
  return request<User>('/api/me/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, token)
}

export async function uploadAvatar(token: string, file: File) {
  const formData = new FormData()
  formData.append('avatar', file)
  return request<User>('/api/me/avatar', { method: 'POST', body: formData }, token)
}

export async function deleteAvatar(token: string) {
  return request<User>('/api/me/avatar', { method: 'DELETE' }, token)
}

export async function fetchAvatarBlob(token: string) {
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_URL}/api/me/avatar`, { headers })
  if (!response.ok) {
    throw new Error('Could not load avatar')
  }
  return response.blob()
}

export async function fetchWorkspaces(token: string) {
  return request<{ workspaces: Workspace[] }>('/api/workspaces', {}, token)
}

export async function createWorkspace(
  token: string,
  name: string,
  message?: string,
  focusAreas?: WorkspaceFocusArea[],
) {
  return request<CreateWorkspaceResult>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name, message, focus_areas: focusAreas }),
  }, token)
}

export async function updateWorkspaceSettings(
  token: string,
  workspaceId: number,
  name: string,
  focusAreas: WorkspaceFocusArea[],
) {
  return request<Workspace>(
    `/api/workspaces/${workspaceId}/settings`,
    { method: 'PATCH', body: JSON.stringify({ name, focus_areas: focusAreas }) },
    token,
  )
}

export async function archiveWorkspace(token: string, workspaceId: number) {
  return request<{ message: string }>(
    `/api/workspaces/${workspaceId}/archive`,
    { method: 'POST' },
    token,
  )
}

export async function leaveWorkspace(token: string, workspaceId: number) {
  return request<{ message: string }>(
    `/api/workspaces/${workspaceId}/members/me`,
    { method: 'DELETE' },
    token,
  )
}

export async function fetchWorkspaceMembers(token: string, workspaceId: number) {
  return request<{ members: WorkspaceMember[] }>(
    `/api/workspaces/${workspaceId}/members`,
    {},
    token,
  )
}

export async function updateWorkspaceMember(
  token: string,
  workspaceId: number,
  userId: number,
  manageAreas: WorkspaceFocusArea[],
) {
  return request<{ member: WorkspaceMember }>(
    `/api/workspaces/${workspaceId}/members/${userId}`,
    { method: 'PATCH', body: JSON.stringify({ manage_areas: manageAreas }) },
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
  files: File[] = [],
) {
  const path = `/api/workspaces/${workspaceId}/chat/conversations/${conversationId}/messages`
  if (files.length === 0) {
    return request<ChatMessage>(
      path,
      { method: 'POST', body: JSON.stringify({ content }) },
      token,
    )
  }

  const body = new FormData()
  body.append('content', content)
  for (const file of files) {
    body.append('files', file)
  }
  return request<ChatMessage>(path, { method: 'POST', body }, token)
}

export function chatAttachmentUrl(workspaceId: number, attachmentId: number) {
  return `${API_URL}/api/workspaces/${workspaceId}/chat/attachments/${attachmentId}`
}

export async function fetchChatAttachmentBlob(
  token: string,
  workspaceId: number,
  attachmentId: number,
) {
  const response = await fetch(chatAttachmentUrl(workspaceId, attachmentId), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error('Could not download attachment')
  }
  return response.blob()
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
    all_day?: boolean
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

export async function fetchIncomeSeries(token: string, workspaceId: number) {
  return request<{ income: IncomeSeries[] }>(
    `/api/workspaces/${workspaceId}/finance/income/series`,
    {},
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

export async function fetchBillSeries(
  token: string,
  workspaceId: number,
  status: 'active' | 'paid_off' | 'all' = 'active',
) {
  const params = new URLSearchParams({ status })
  return request<{ bills: BillSeries[] }>(
    `/api/workspaces/${workspaceId}/finance/bills/series?${params.toString()}`,
    {},
    token,
  )
}

export async function fetchEventSeries(token: string, workspaceId: number) {
  return request<{ events: EventSeries[] }>(
    `/api/workspaces/${workspaceId}/events/series`,
    {},
    token,
  )
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
    paid_off?: boolean
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

export type TodoListQuery = {
  date?: string
  start?: string
  end?: string
}

export async function fetchTodoLists(
  token: string,
  workspaceId: number,
  query?: string | TodoListQuery,
) {
  const params = new URLSearchParams()
  if (typeof query === 'string') {
    if (query) params.set('date', query)
  } else if (query) {
    if (query.date) params.set('date', query.date)
    if (query.start) params.set('start', query.start)
    if (query.end) params.set('end', query.end)
  }
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return request<{ lists: TodoList[] }>(
    `/api/workspaces/${workspaceId}/todo-lists${suffix}`,
    {},
    token,
  )
}

export async function ensureDailyList(token: string, workspaceId: number, date: string) {
  return request<{ list_id: number | null; date: string }>(
    `/api/workspaces/${workspaceId}/todo-lists/daily/${date}`,
    {},
    token,
  )
}

export async function createTodoList(
  token: string,
  workspaceId: number,
  payload: { name: string; kind?: string; list_date?: string; recurrence?: string; period_scope?: string },
) {
  return request<TodoList>(
    `/api/workspaces/${workspaceId}/todo-lists`,
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}

export async function updateTodoList(
  token: string,
  workspaceId: number,
  listId: number,
  payload: { name: string; kind?: string; list_date?: string; recurrence?: string; period_scope?: string },
) {
  return request<TodoList>(
    `/api/workspaces/${workspaceId}/todo-lists/${listId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token,
  )
}

export async function deleteTodoList(token: string, workspaceId: number, listId: number) {
  return request<{ message: string }>(
    `/api/workspaces/${workspaceId}/todo-lists/${listId}`,
    { method: 'DELETE' },
    token,
  )
}

export async function fetchTodos(
  token: string,
  workspaceId: number,
  listId?: number,
  occurrence?: string,
) {
  const params = new URLSearchParams()
  if (listId) params.set('list_id', String(listId))
  if (occurrence) params.set('occurrence', occurrence)
  const query = params.toString() ? `?${params.toString()}` : ''
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
  payload: { title?: string; completed?: boolean; occurrence?: string },
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

export async function updateNote(
  token: string,
  workspaceId: number,
  noteId: number,
  payload: { title?: string; content?: string },
) {
  return request<{ message: string }>(
    `/api/workspaces/${workspaceId}/notes/${noteId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token,
  )
}

export async function deleteNote(token: string, workspaceId: number, noteId: number) {
  return request<{ message: string }>(
    `/api/workspaces/${workspaceId}/notes/${noteId}`,
    { method: 'DELETE' },
    token,
  )
}

export async function deleteTodo(token: string, workspaceId: number, todoId: number) {
  return request<{ message: string }>(
    `/api/workspaces/${workspaceId}/todos/${todoId}`,
    { method: 'DELETE' },
    token,
  )
}

export function getWebSocketUrl(token: string) {
  const apiUrl = new URL(API_URL || window.location.origin)
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  apiUrl.pathname = '/ws'
  apiUrl.search = `token=${encodeURIComponent(token)}`
  apiUrl.hash = ''
  return apiUrl.toString()
}

export { API_URL }
