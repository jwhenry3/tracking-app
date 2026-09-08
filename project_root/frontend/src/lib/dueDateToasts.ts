import type { NavigateFunction } from 'react-router-dom'

import type { Bill, Expense } from '@/lib/types'
import {
  isDueTodayBill,
  isDueTodayExpense,
  isPastDueBill,
  isPastDueExpense,
  money,
} from '@/lib/financeUtils'
import { toastOnce } from '@/lib/toast'

function financeTimelinePath(workspaceId: number) {
  return `/w/${workspaceId}/finances/timeline`
}

export function notifyDueBillIfNeeded(
  bill: Bill,
  workspaceName: string,
  navigate: NavigateFunction,
) {
  const keyBase = `due:bill:${bill.workspace_id}:${bill.id}`

  if (isPastDueBill(bill)) {
    toastOnce(`${keyBase}:past-due`, {
      title: 'Bill past due',
      description: `${bill.title} · ${money(bill.amount)} · ${workspaceName}`,
      variant: 'destructive',
      duration: 8000,
      action: {
        label: 'View timeline',
        onClick: () => navigate(financeTimelinePath(bill.workspace_id)),
      },
    })
    return
  }

  if (isDueTodayBill(bill)) {
    toastOnce(`${keyBase}:due-today`, {
      title: 'Bill due today',
      description: `${bill.title} · ${money(bill.amount)} · ${workspaceName}`,
      variant: 'warning',
      action: {
        label: 'View timeline',
        onClick: () => navigate(financeTimelinePath(bill.workspace_id)),
      },
    })
  }
}

export function notifyDueExpenseIfNeeded(
  expense: Expense,
  workspaceName: string,
  navigate: NavigateFunction,
) {
  const keyBase = `due:expense:${expense.workspace_id}:${expense.id}`

  if (isPastDueExpense(expense)) {
    toastOnce(`${keyBase}:past-due`, {
      title: 'Expense past due',
      description: `${expense.title} · ${money(expense.amount)} · ${workspaceName}`,
      variant: 'destructive',
      duration: 8000,
      action: {
        label: 'View timeline',
        onClick: () => navigate(financeTimelinePath(expense.workspace_id)),
      },
    })
    return
  }

  if (isDueTodayExpense(expense)) {
    toastOnce(`${keyBase}:due-today`, {
      title: 'Expense due today',
      description: `${expense.title} · ${money(expense.amount)} · ${workspaceName}`,
      variant: 'warning',
      action: {
        label: 'View timeline',
        onClick: () => navigate(financeTimelinePath(expense.workspace_id)),
      },
    })
  }
}

export function isBillPayload(value: unknown): value is Bill {
  if (!value || typeof value !== 'object') return false
  const bill = value as Bill
  return (
    typeof bill.id === 'number'
    && typeof bill.workspace_id === 'number'
    && typeof bill.title === 'string'
    && typeof bill.due_date === 'string'
    && typeof bill.paid === 'boolean'
  )
}

export function isExpensePayload(value: unknown): value is Expense {
  if (!value || typeof value !== 'object') return false
  const expense = value as Expense
  return (
    typeof expense.id === 'number'
    && typeof expense.workspace_id === 'number'
    && typeof expense.title === 'string'
    && typeof expense.expense_date === 'string'
    && typeof expense.paid === 'boolean'
  )
}
