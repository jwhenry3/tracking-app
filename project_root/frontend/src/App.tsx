import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { CalendarView } from '@/views/CalendarView'
import { FinancesView } from '@/views/FinancesView'
import { PlannerView } from '@/views/PlannerView'
import { TodosView } from '@/views/TodosView'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { WorkspaceOnboardingPage } from '@/pages/WorkspaceOnboardingPage'
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

function App() {
  const token = useAuthStore((state) => state.token)

  return (
    <Routes>
      <Route path="/login" element={token ? <WorkspaceHome /> : <LoginPage />} />
      <Route path="/register" element={token ? <WorkspaceHome /> : <RegisterPage />} />
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
        <Route path="planner/monthly" element={<PlannerView mode="monthly" />} />
        <Route path="finances" element={<FinancesView />} />
        <Route path="todos" element={<TodosView />} />
      </Route>
      <Route path="/" element={<WorkspaceHome />} />
    </Routes>
  )
}

export default App
