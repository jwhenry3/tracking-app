import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { CalendarView } from '@/views/CalendarView'
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
import { defaultManageTab } from '@/lib/manageTabs'
import { useAuthStore } from '@/stores/authStore'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.token)
  if (!token) return <Navigate to="/login" replace />
  return children
}

function WorkspaceHome() {
  const token = useAuthStore((state) => state.token)
  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId)
  const workspaces = useAuthStore((state) => state.workspaces)
  const workspaceId = activeWorkspaceId ?? workspaces[0]?.id

  if (!token) return <Navigate to="/login" replace />
  if (!workspaceId) return <WorkspaceOnboardingPage />

  return <Navigate to={`/w/${workspaceId}/calendar`} replace />
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

function LegacyManageRedirect({ tab }: { tab: 'bills' | 'events' | 'expenses' }) {
  const { workspaceId } = useParams()
  return <Navigate to={`/w/${workspaceId}/manage/${tab}`} replace />
}

function App() {
  const token = useAuthStore((state) => state.token)

  return (
    <Routes>
      <Route path="/login" element={token ? <WorkspaceHome /> : <LoginPage />} />
      <Route path="/register" element={token ? <WorkspaceHome /> : <RegisterPage />} />
      <Route path="/forgot-password" element={token ? <WorkspaceHome /> : <ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/w/:workspaceId"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="calendar" element={<CalendarView />} />
        <Route path="planner/daily" element={<PlannerView mode="daily" />} />
        <Route path="planner/weekly" element={<PlannerView mode="weekly" />} />
        <Route path="planner/monthly" element={<Navigate to="../planner/weekly" replace />} />
        <Route path="finances" element={<Navigate to="runway" replace />} />
        <Route path="finances/runway" element={<FinancesView view="runway" />} />
        <Route path="finances/timeline" element={<FinancesView view="timeline" />} />
        <Route path="finances/analytics" element={<FinancesView view="analytics" />} />
        <Route path="finances/manage" element={<ManageDefaultRedirect />} />
        <Route path="finances/manage/bills" element={<LegacyManageRedirect tab="bills" />} />
        <Route path="finances/manage/events" element={<LegacyManageRedirect tab="events" />} />
        <Route path="finances/manage/expenses" element={<LegacyManageRedirect tab="expenses" />} />
        <Route path="check-lists" element={<CheckListsView />} />
        <Route path="todos" element={<Navigate to="../check-lists" replace />} />
        <Route path="chat" element={<ChatView />} />
        <Route path="manage" element={<ManageDefaultRedirect />} />
        <Route path="manage/bills" element={<ManageView tab="bills" />} />
        <Route path="manage/events" element={<ManageView tab="events" />} />
        <Route path="manage/expenses" element={<ManageView tab="expenses" />} />
      </Route>
      <Route path="/" element={<WorkspaceHome />} />
    </Routes>
  )
}

export default App
