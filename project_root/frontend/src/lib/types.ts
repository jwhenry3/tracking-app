export type Workspace = {
  id: number
  name: string
  slug: string
  role: string
}

export type CreateWorkspaceResult = {
  status: 'created' | 'access_requested' | 'already_member'
  workspace: Workspace
}

export type WorkspaceMember = {
  user_id: number
  username: string
  role: string
  joined_at: string
}

export type WorkspaceAccessRequest = {
  id: number
  workspace_id: number
  workspace_name: string
  user_id: number
  username: string
  message: string
  status: string
  created_at: string
}

export type WorkspaceInvite = {
  id: number
  workspace_id: number
  workspace_name: string
  invited_by: string
  status: string
  created_at: string
}

export type ChatConversation = {
  id: number
  workspace_id: number
  kind: 'group' | 'direct'
  title: string
  members?: string[]
}

export type ChatMessage = {
  id: number
  conversation_id: number
  sender_id: number
  sender_username: string
  content: string
  created_at: string
}

export type PlannerEvent = {
  series_id: number
  occurrence_id: string
  id: number
  workspace_id: number
  title: string
  description: string
  start_at: string
  end_at: string
  all_day: boolean
  color: string
  recurrence: string
  is_recurring: boolean
  series_anchor_date?: string
  created_by: number
}

export type IncomeEntry = {
  series_id: number
  occurrence_id: string
  id: number
  workspace_id: number
  title: string
  amount: number
  entry_date: string
  recurrence: string
  is_recurring: boolean
  series_anchor_date?: string
  notes: string
  created_by: number
}

export type Bill = {
  series_id: number
  occurrence_id: string
  id: number
  workspace_id: number
  title: string
  amount: number
  due_date: string
  paid: boolean
  paid_at?: string | null
  skipped?: boolean
  payment_notes?: string
  recurrence: string
  is_recurring: boolean
  series_anchor_date?: string
  category: string
  created_by: number
}

export type Expense = {
  id: number
  workspace_id: number
  title: string
  amount: number
  expense_date: string
  paid: boolean
  paid_at?: string | null
  skipped?: boolean
  payment_notes?: string
  category: string
  notes: string
  created_by: number
}

export type FinanceSummary = {
  income_total: number
  bills_due: number
  expense_total: number
  net: number
}

export type TodoList = {
  id: number
  workspace_id: number
  name: string
  kind: 'daily' | 'general'
  list_date?: string | null
}

export type Todo = {
  id: number
  workspace_id: number
  list_id: number
  title: string
  completed: boolean
  due_date?: string | null
  position: number
  created_by: number
}

export type Note = {
  id: number
  workspace_id: number
  list_id?: number | null
  title: string
  content: string
  created_by: number
  updated_at: string
}

export type NavSection =
  | 'calendar'
  | 'planner-daily'
  | 'planner-weekly'
  | 'planner-monthly'
  | 'finances'
  | 'todos'
  | 'chat'
