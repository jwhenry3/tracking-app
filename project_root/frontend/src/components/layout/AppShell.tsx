import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  ChevronDown,
  LayoutGrid,
  MessageSquare,
  Plus,
  Settings2,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { AddWorkspaceDialog } from '@/components/workspace/AddWorkspaceDialog'
import { RealtimeQuerySync } from '@/components/layout/RealtimeQuerySync'
import { UserMenu } from '@/components/layout/UserMenu'
import { UserProfilePanel } from '@/components/profile/UserProfilePanel'
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel'
import { cn } from '@/lib/utils'
import type { WorkspaceFocusArea } from '@/lib/types'
import { isWorkspaceRouteAllowed, workspaceHasFocus } from '@/lib/workspaceFocus'
import { canManageWorkspace } from '@/lib/workspacePermissions'
import { useAuthStore } from '@/stores/authStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  matchSubpaths?: boolean
  focusArea?: WorkspaceFocusArea
  requireManage?: boolean
  requireAnyManage?: boolean
}

type NavSection = {
  id: string
  title: string
  focusArea?: WorkspaceFocusArea
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    id: 'general',
    title: 'General',
    items: [
      { to: 'calendar', label: 'Calendar', icon: CalendarDays },
      { to: 'chat', label: 'Chat', icon: MessageSquare },
      { to: 'manage', label: 'Manage', icon: Settings2, matchSubpaths: true, requireAnyManage: true },
    ],
  },
  {
    id: 'planner',
    title: 'Planner',
    focusArea: 'planning',
    items: [
      { to: 'planner/daily', label: 'Daily', icon: LayoutGrid },
      { to: 'planner/weekly', label: 'Weekly', icon: CalendarRange },
      { to: 'check-lists', label: 'Check lists & notes', icon: CheckSquare },
    ],
  },
  {
    id: 'finances',
    title: 'Finances',
    focusArea: 'finances',
    items: [
      { to: 'finances/runway', label: 'Until next income', icon: Wallet },
      { to: 'finances/timeline', label: 'Timeline', icon: CalendarRange },
      { to: 'finances/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
]

function sectionContainsPath(section: NavSection, pathname: string, workspaceId: string) {
  const basePath = `/w/${workspaceId}/`
  return section.items.some(
    (item) => pathname === `${basePath}${item.to}` || pathname.startsWith(`${basePath}${item.to}/`),
  )
}

function workspaceInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
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
  const [profilePanelOpen, setProfilePanelOpen] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  function isSectionCollapsed(sectionId: string) {
    return collapsedSections[sectionId] ?? false
  }

  function toggleSection(sectionId: string) {
    setCollapsedSections((current) => ({
      ...current,
      [sectionId]: !isSectionCollapsed(sectionId),
    }))
  }

  const currentWorkspace =
    workspaces.find((ws) => ws.id === Number(workspaceId)) ??
    workspaces.find((ws) => ws.id === activeWorkspaceId)

  const visibleSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            const area = item.focusArea ?? section.focusArea
            if (area && !workspaceHasFocus(currentWorkspace, area)) {
              return false
            }
            if (item.requireAnyManage) {
              return (
                canManageWorkspace(currentWorkspace, 'planning') ||
                canManageWorkspace(currentWorkspace, 'finances')
              )
            }
            if (item.requireManage && area && !canManageWorkspace(currentWorkspace, area)) {
              return false
            }
            return true
          }),
        }))
        .filter(
          (section) =>
            section.items.length > 0 &&
            (!section.focusArea || workspaceHasFocus(currentWorkspace, section.focusArea)),
        ),
    [currentWorkspace],
  )

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

  useEffect(() => {
    if (!workspaceId || !currentWorkspace) return
    if (!isWorkspaceRouteAllowed(location.pathname, workspaceId, currentWorkspace)) {
      navigate(`/w/${workspaceId}/calendar`, { replace: true })
    }
  }, [location.pathname, workspaceId, currentWorkspace, navigate])

  useEffect(() => {
    if (!workspaceId) return

    setCollapsedSections((current) => {
      let next: Record<string, boolean> | null = null

      for (const section of visibleSections) {
        if (sectionContainsPath(section, location.pathname, workspaceId) && (current[section.id] ?? false)) {
          if (!next) next = { ...current }
          next[section.id] = false
        }
      }

      return next ?? current
    })
  }, [location.pathname, workspaceId, visibleSections])

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
          <UserMenu
            connected={connected}
            onOpenSettings={() => setProfilePanelOpen(true)}
            onLogout={handleLogout}
          />

          <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
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
          </div>

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
            <p className="mt-1 text-xs text-muted-foreground">
              {connected ? 'Live sync connected' : 'Live sync disconnected'}
            </p>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            {visibleSections.map((section, sectionIndex) => {
              const collapsed = isSectionCollapsed(section.id)

              return (
                <div key={section.id} className={cn(sectionIndex > 0 && 'mt-4')}>
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    onClick={() => toggleSection(section.id)}
                    className="mb-1 flex w-full items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 transition-transform',
                        collapsed && '-rotate-90',
                      )}
                    />
                    <span className="truncate">{section.title}</span>
                  </button>
                  {!collapsed ? (
                    <div className="space-y-1">
                      {section.items.map(({ to, label, icon: Icon, matchSubpaths }) => {
                        const itemPath = `/w/${workspaceId}/${to}`
                        return (
                        <NavLink
                          key={to}
                          to={itemPath}
                          end={!matchSubpaths}
                          className={({ isActive }) => {
                            const active =
                              isActive ||
                              (matchSubpaths &&
                                (location.pathname === itemPath ||
                                  location.pathname.startsWith(`${itemPath}/`)))
                            return cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                              active
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )
                          }}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{label}</span>
                        </NavLink>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </nav>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <RealtimeQuerySync />
          <Outlet />
        </main>
      </div>

      <UserProfilePanel open={profilePanelOpen} onOpenChange={setProfilePanelOpen} />

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
