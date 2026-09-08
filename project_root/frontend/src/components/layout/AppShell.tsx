import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import {
  CalendarDays,
  CheckSquare,
  LayoutGrid,
  LogOut,
  Plus,
  Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const createWorkspace = useAuthStore((s) => s.createWorkspace)
  const logout = useAuthStore((s) => s.logout)
  const connect = useRealtimeStore((s) => s.connect)
  const disconnect = useRealtimeStore((s) => s.disconnect)
  const connected = useRealtimeStore((s) => s.connected)

  const [newWorkspaceName, setNewWorkspaceName] = useState('')

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

  async function handleCreateWorkspace() {
    const name = newWorkspaceName.trim()
    if (!name) return
    const workspace = await createWorkspace(name)
    setNewWorkspaceName('')
    navigate(`/w/${workspace.id}/calendar`)
  }

  function handleLogout() {
    disconnect()
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-[72px] shrink-0 flex-col items-center gap-2 border-r bg-[#1a1d21] py-3 text-white">
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            title={workspace.name}
            onClick={() => {
              setActiveWorkspace(workspace.id)
              navigate(`/w/${workspace.id}/calendar`)
            }}
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
            title="Create workspace"
            onClick={() => {
              const name = window.prompt('Workspace name')
              if (name) void createWorkspace(name).then((ws) => navigate(`/w/${ws.id}/calendar`))
            }}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </aside>

      <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/20">
        <div className="border-b px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
          <h1 className="truncate text-lg font-semibold">{currentWorkspace?.name ?? 'Home'}</h1>
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
          <div className="space-y-2">
            <Input
              placeholder="New workspace"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
            />
            <Button className="w-full" variant="outline" onClick={() => void handleCreateWorkspace()}>
              Add workspace
            </Button>
          </div>
          <Button className="w-full" variant="ghost" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
