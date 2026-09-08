import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import {
  CalendarDays,
  CheckSquare,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Plus,
  Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { AddWorkspaceDialog } from '@/components/workspace/AddWorkspaceDialog'
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

const navItems = [
  { to: 'calendar', label: 'Calendar', icon: CalendarDays },
  { to: 'planner/daily', label: 'Daily planner', icon: LayoutGrid },
  { to: 'planner/weekly', label: 'Weekly planner', icon: LayoutGrid },
  { to: 'planner/monthly', label: 'Monthly planner', icon: LayoutGrid },
  { to: 'finances', label: 'Finances', icon: Wallet },
  { to: 'todos', label: 'Todos & notes', icon: CheckSquare },
  { to: 'chat', label: 'Chat', icon: MessageSquare },
]

function workspaceInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function AppShell() {
  const navigate = useNavigate()
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
  const username = useAuthStore((s) => s.username)
  const workspaces = useAuthStore((s) => s.workspaces)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace)
  const loadWorkspaces = useAuthStore((s) => s.loadWorkspaces)
  const logout = useAuthStore((s) => s.logout)
  const connect = useRealtimeStore((s) => s.connect)
  const disconnect = useRealtimeStore((s) => s.disconnect)
  const connected = useRealtimeStore((s) => s.connected)

  const [addWorkspaceOpen, setAddWorkspaceOpen] = useState(false)
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false)

  const currentWorkspace =
    workspaces.find((ws) => ws.id === Number(workspaceId)) ??
    workspaces.find((ws) => ws.id === activeWorkspaceId)

  useEffect(() => {
    if (!token || !workspaceId) return

    let connectionId: number | undefined
    const timeoutId = window.setTimeout(() => {
      connectionId = connect(token, Number(workspaceId))
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      if (connectionId !== undefined) disconnect(connectionId)
    }
  }, [token, workspaceId, connect, disconnect])

  function handleWorkspaceClick(workspace: (typeof workspaces)[number]) {
    if (Number(workspaceId) === workspace.id) {
      setWorkspacePanelOpen(true)
      return
    }
    setActiveWorkspace(workspace.id)
    navigate(`/w/${workspace.id}/calendar`)
  }

  function handleLogout() {
    disconnect()
    logout()
    navigate('/login')
  }

  return (
    <>
      <div className="flex h-screen bg-background text-foreground">
        <aside className="flex w-[72px] shrink-0 flex-col items-center gap-2 border-r bg-[#1a1d21] py-3 text-white">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              title={Number(workspaceId) === workspace.id ? `${workspace.name} · members & invites` : workspace.name}
              onClick={() => handleWorkspaceClick(workspace)}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold transition',
                Number(workspaceId) === workspace.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/10 hover:bg-white/20',
              )}
            >
              {workspaceInitials(workspace.name)}
            </button>
          ))}
          <div className="mt-auto flex flex-col items-center gap-2">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20"
              title="Add workspace"
              onClick={() => setAddWorkspaceOpen(true)}
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </aside>

        <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/20">
          <div className="border-b px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
            <button
              type="button"
              className="truncate text-left text-lg font-semibold hover:underline"
              onClick={() => currentWorkspace && setWorkspacePanelOpen(true)}
            >
              {currentWorkspace?.name ?? 'Home'}
            </button>
            <p className="text-sm text-muted-foreground">Signed in as {username}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {connected ? 'Live sync connected' : 'Live sync disconnected'}
            </p>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={`/w/${workspaceId}/${to}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-3 border-t p-3">
            <Button className="w-full" variant="outline" onClick={() => setAddWorkspaceOpen(true)}>
              Add workspace
            </Button>
            <Button className="w-full" variant="ghost" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          <Outlet />
        </main>
      </div>

      <WorkspacePanel
        open={workspacePanelOpen}
        onOpenChange={setWorkspacePanelOpen}
        workspace={currentWorkspace}
      />

      <AddWorkspaceDialog
        open={addWorkspaceOpen}
        onOpenChange={setAddWorkspaceOpen}
        onComplete={async (result) => {
          await loadWorkspaces()
          if (result.status === 'created' || result.status === 'already_member') {
            navigate(`/w/${result.workspace.id}/calendar`)
          }
        }}
      />
    </>
  )
}
