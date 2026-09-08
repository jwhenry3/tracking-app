import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchBills, fetchExpenses } from '@/lib/api'
import {
  isBillPayload,
  isExpensePayload,
  notifyDueBillIfNeeded,
  notifyDueExpenseIfNeeded,
} from '@/lib/dueDateToasts'
import { toastOnce } from '@/lib/toast'
import type { Bill, ChatMessage, Expense } from '@/lib/types'
import { getUserDisplayName } from '@/lib/userProfile'
import { isDueToday, isPastDue, todayIso } from '@/lib/financeUtils'
import { workspaceHasFocus } from '@/lib/workspaceFocus'
import { useAuthStore } from '@/stores/authStore'
import { useChatFocusStore } from '@/stores/chatFocusStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

type RealtimePayload = {
  type?: string
  entity?: string
  action?: string
  workspace_id?: number
  payload?: unknown
}

type DueScanItem =
  | { kind: 'bill'; item: Bill; workspaceName: string }
  | { kind: 'expense'; item: Expense; workspaceName: string }

function chatStorageKey(workspaceId: number) {
  return `chat-active-${workspaceId}`
}

function isChatMessagePayload(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as ChatMessage
  return (
    typeof message.id === 'number'
    && typeof message.conversation_id === 'number'
    && typeof message.sender_username === 'string'
    && (typeof message.sender_display_name === 'string' || message.sender_display_name === undefined)
    && typeof message.content === 'string'
  )
}

function chatSenderLabel(message: ChatMessage) {
  return getUserDisplayName({
    display_name: message.sender_display_name,
    username: message.sender_username,
  })
}

function messagePreview(content: string) {
  const trimmed = content.trim()
  if (!trimmed) return 'Sent a message'
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed
}

function classifyDueDate(date: string, today: string) {
  if (isPastDue(date, today)) return 'past-due'
  if (isDueToday(date, today)) return 'due-today'
  return null
}

export function RealtimeToastSync() {
  const navigate = useNavigate()
  const subscribe = useRealtimeStore((state) => state.subscribe)
  const username = useAuthStore((state) => state.username)
  const workspaces = useAuthStore((state) => state.workspaces)
  const chatFocus = useChatFocusStore()

  const workspacesRef = useRef(workspaces)
  workspacesRef.current = workspaces
  const chatFocusRef = useRef(chatFocus)
  chatFocusRef.current = chatFocus

  useEffect(() => {
    return subscribe((payload) => {
      const message = payload as RealtimePayload
      if (message.type === 'connected') return

      const workspaceId = message.workspace_id
      const workspaceName =
        workspacesRef.current.find((workspace) => workspace.id === workspaceId)?.name ?? 'Workspace'

      if (
        (message.entity === 'message' || message.entity === 'chat' || message.entity === 'chat_message')
        && message.action === 'created'
        && isChatMessagePayload(message.payload)
        && workspaceId
      ) {
        const chatMessage = message.payload
        const focus = chatFocusRef.current
        if (chatMessage.sender_username === username) return
        if (focus.workspaceId === workspaceId && focus.conversationId === chatMessage.conversation_id) {
          return
        }

        toastOnce(`chat:${chatMessage.id}`, {
          title: chatSenderLabel(chatMessage),
          description: `${workspaceName}: ${messagePreview(chatMessage.content)}`,
          duration: 7000,
          action: {
            label: 'Open chat',
            onClick: () => {
              sessionStorage.setItem(chatStorageKey(workspaceId), String(chatMessage.conversation_id))
              navigate(`/w/${workspaceId}/chat`)
            },
          },
        })
        return
      }

      if (message.entity === 'bill' && message.action === 'created' && isBillPayload(message.payload)) {
        notifyDueBillIfNeeded(message.payload, workspaceName, navigate)
        return
      }

      if (message.entity === 'expense' && message.action === 'created' && isExpensePayload(message.payload)) {
        notifyDueExpenseIfNeeded(message.payload, workspaceName, navigate)
      }
    })
  }, [subscribe, username, navigate])

  return null
}

export function DueDateToastSync() {
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)
  const sessionReady = useAuthStore((state) => state.sessionReady)
  const workspaces = useAuthStore((state) => state.workspaces)
  const scanKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!token || !sessionReady) return

    const financeWorkspaces = workspaces.filter((workspace) => workspaceHasFocus(workspace, 'finances'))
    const scanKey = `${token}:${financeWorkspaces.map((workspace) => workspace.id).join(',')}`
    if (scanKeyRef.current === scanKey) return
    scanKeyRef.current = scanKey

    if (financeWorkspaces.length === 0) return

    let cancelled = false

    async function scanDueItems() {
      const today = todayIso()
      const lookback = new Date()
      lookback.setDate(lookback.getDate() - 90)
      const start = lookback.toISOString().slice(0, 10)
      const dueItems: DueScanItem[] = []

      for (const workspace of financeWorkspaces) {
        if (cancelled) return

        try {
          const { bills } = await fetchBills(token!, workspace.id, start, today)
          for (const bill of bills) {
            if (bill.paid || bill.skipped) continue
            const urgency = classifyDueDate(bill.due_date, today)
            if (!urgency) continue
            dueItems.push({ kind: 'bill', item: bill, workspaceName: workspace.name })
          }

          const { expenses } = await fetchExpenses(token!, workspace.id)
          for (const expense of expenses) {
            if (expense.paid || expense.skipped) continue
            const urgency = classifyDueDate(expense.expense_date, today)
            if (!urgency) continue
            dueItems.push({ kind: 'expense', item: expense, workspaceName: workspace.name })
          }
        } catch {
          // Ignore scan errors; individual views still load data.
        }
      }

      if (cancelled || dueItems.length === 0) return

      if (dueItems.length <= 4) {
        for (const dueItem of dueItems) {
          if (dueItem.kind === 'bill') {
            notifyDueBillIfNeeded(dueItem.item, dueItem.workspaceName, navigate)
          } else {
            notifyDueExpenseIfNeeded(dueItem.item, dueItem.workspaceName, navigate)
          }
        }
        return
      }

      const pastDueCount = dueItems.filter((dueItem) => {
        const date = dueItem.kind === 'bill' ? dueItem.item.due_date : dueItem.item.expense_date
        return isPastDue(date, today)
      }).length
      const dueTodayCount = dueItems.length - pastDueCount

      toastOnce(`due:session-summary:${scanKey}`, {
        title: 'Items need attention',
        description: `${pastDueCount} past due and ${dueTodayCount} due today across your workspaces.`,
        variant: pastDueCount > 0 ? 'destructive' : 'warning',
        duration: 9000,
      })
    }

    void scanDueItems()

    return () => {
      cancelled = true
    }
  }, [token, sessionReady, workspaces, navigate])

  return null
}
