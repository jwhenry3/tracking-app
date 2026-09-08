import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { CalendarView } from '@/views/CalendarView'
import { CentralCalendarView } from '@/views/CentralCalendarView'
import { ChatView } from '@/views/ChatView'
import { FinancesView } from '@/views/FinancesView'
import { PlannerView } from '@/views/PlannerView'
import { ManageView } from '@/views/manage/ManageView'
import { CheckListsView } from '@/views/CheckListsView'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { WorkspaceOnboardingPage } from '@/pages/WorkspaceOnboardingPage'
import { APP_NAME } from '@/lib/branding'
import { defaultManageTab } from '@/lib/manageTabs'
import { useAuthStore } from '@/stores/authStore'

function SessionLoadingScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-background text-muted-foreground">
      <p className="text-sm font-semibold text-foreground">{APP_NAME}</p>
      <p>Loading…</p>
    </div>
  )
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.token)
  const sessionReady = useAuthStore((state) => state.sessionReady)
  if (!token) return <Navigate to="/login" replace />
  if (!sessionReady) return <SessionLoadingScreen />
  return children
}

function WorkspaceHome() {
  const token = useAuthStore((state) => state.token)
  const sessionReady = useAuthStore((state) => state.sessionReady)
  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId)
  const workspaces = useAuthStore((state) => state.workspaces)
  const workspaceId = activeWorkspaceId ?? workspaces[0]?.id

  if (!token) return <Navigate to="/login" replace />
  if (!sessionReady) return <SessionLoadingScreen />
  if (!workspaceId) return <WorkspaceOnboardingPage />

  return <Navigate to="/calendar" replace />
}

function AuthenticatedEntry() {
  const token = useAuthStore((state) => state.token)
  const sessionReady = useAuthStore((state) => state.sessionReady)
  if (token && !sessionReady) return <SessionLoadingScreen />
  if (token) return <WorkspaceHome />
  return null
}

function ManageDefaultRedirect() {
  const { workspaceId } = useParams()
  const workspaces = useAuthStore((state) => state.workspaces)
  const workspace = workspaces.find((item) => item.id === Number(workspaceId))
  const tab = defaultManageTab(workspace)

  if (!tab) {
    return <Navigate to={`/w/${workspaceId}/calendar`} replace />
  }

  return <Navigate to={`/w/${workspaceId}/manage/${tab}`} replace />
}

function LegacyManageRedirect({ tab }: { tab: 'bills' | 'events' | 'expenses' | 'income' }) {
  const { workspaceId } = useParams()
  return <Navigate to={`/w/${workspaceId}/manage/${tab}`} replace />
}

function App() {
  const token = useAuthStore((state) => state.token)

  return (
    <Routes>
      <Route path="/login" element={token ? <AuthenticatedEntry /> : <LoginPage />} />
      <Route path="/register" element={token ? <AuthenticatedEntry /> : <RegisterPage />} />
      <Route path="/forgot-password" element={token ? <AuthenticatedEntry /> : <ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="calendar" element={<CentralCalendarView />} />
        <Route path="w/:workspaceId">
          <Route path="calendar" element={<CalendarView />} />
        <Route path="planner/daily" element={<PlannerView mode="daily" />} />
        <Route path="planner/weekly" element={<PlannerView mode="weekly" />} />
        <Route path="planner/monthly" element={<Navigate to="../planner/weekly" replace />} />
        <Route path="finances" element={<Navigate to="timeline" replace />} />
        <Route path="finances/runway" element={<Navigate to="../timeline" replace />} />
        <Route path="finances/timeline" element={<FinancesView view="timeline" />} />
        <Route path="finances/analytics" element={<FinancesView view="analytics" />} />
        <Route path="finances/manage" element={<ManageDefaultRedirect />} />
        <Route path="finances/manage/bills" element={<LegacyManageRedirect tab="bills" />} />
        <Route path="finances/manage/events" element={<LegacyManageRedirect tab="events" />} />
        <Route path="finances/manage/expenses" element={<LegacyManageRedirect tab="expenses" />} />
        <Route path="finances/manage/income" element={<LegacyManageRedirect tab="income" />} />
        <Route path="check-lists" element={<CheckListsView />} />
        <Route path="todos" element={<Navigate to="../check-lists" replace />} />
        <Route path="chat" element={<ChatView />} />
        <Route path="manage" element={<ManageDefaultRedirect />} />
        <Route path="manage/bills" element={<ManageView tab="bills" />} />
        <Route path="manage/events" element={<ManageView tab="events" />} />
        <Route path="manage/income" element={<ManageView tab="income" />} />
        <Route path="manage/expenses" element={<ManageView tab="expenses" />} />
        </Route>
      </Route>
      <Route path="/" element={<WorkspaceHome />} />
    </Routes>
  )
}

export default App
