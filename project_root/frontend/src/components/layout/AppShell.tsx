import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  ChevronDown,
  LayoutGrid,
  Menu,
  MessageSquare,
  Plus,
  Settings2,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'

import { WorkspaceChecklist } from '@/components/calendar/WorkspaceChecklist'
import { AddWorkspaceDialog } from '@/components/workspace/AddWorkspaceDialog'
import { ProductBrandHeader } from '@/components/layout/ProductBrandHeader'
import { RealtimeQuerySync } from '@/components/layout/RealtimeQuerySync'
import { DueDateToastSync, RealtimeToastSync } from '@/components/layout/ToastSync'
import { UserMenu } from '@/components/layout/UserMenu'
import { UserProfilePanel } from '@/components/profile/UserProfilePanel'
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel'
import { cn } from '@/lib/utils'
import type { WorkspaceFocusArea } from '@/lib/types'
import { isWorkspaceRouteAllowed, workspaceHasFocus } from '@/lib/workspaceFocus'
import { canManageWorkspace } from '@/lib/workspacePermissions'
import { useAuthStore } from '@/stores/authStore'
import { useCentralCalendarFilterStore } from '@/stores/centralCalendarFilterStore'
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
      { to: 'check-lists', label: 'Task list', icon: CheckSquare },
    ],
  },
  {
    id: 'finances',
    title: 'Finances',
    focusArea: 'finances',
    items: [
      { to: 'finances/timeline', label: 'Timeline', icon: CalendarRange },
      { to: 'finances/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
]

const mobileTabItems: NavItem[] = [
  { to: 'calendar', label: 'Calendar', icon: CalendarDays },
  { to: 'planner/daily', label: 'Planner', icon: LayoutGrid, focusArea: 'planning' },
  { to: 'finances/timeline', label: 'Finances', icon: Wallet, focusArea: 'finances' },
  { to: 'chat', label: 'Chat', icon: MessageSquare },
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

function workspaceRouteSuffix(pathname: string) {
  const match = pathname.match(/^\/w\/\d+\/(.*)$/)
  return match?.[1] ?? 'calendar'
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspaceId } = useParams()
  const isCentralCalendar = /^\/calendar\/?$/.test(location.pathname)
  const token = useAuthStore((s) => s.token)
  const workspaces = useAuthStore((s) => s.workspaces)
  const workspaceIds = useMemo(() => workspaces.map((workspace) => workspace.id), [workspaces])
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const selectedCalendarWorkspaceIds = useCentralCalendarFilterStore((s) => s.selectedWorkspaceIds)
  const syncCalendarWorkspaces = useCentralCalendarFilterStore((s) => s.syncWorkspaces)
  const toggleCalendarWorkspace = useCentralCalendarFilterStore((s) => s.toggleWorkspace)
  const selectAllCalendarWorkspaces = useCentralCalendarFilterStore((s) => s.selectAllWorkspaces)
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace)
  const loadWorkspaces = useAuthStore((s) => s.loadWorkspaces)
  const logout = useAuthStore((s) => s.logout)
  const connect = useRealtimeStore((s) => s.connect)
  const disconnect = useRealtimeStore((s) => s.disconnect)
  const connected = useRealtimeStore((s) => s.connected)
  const effectiveWorkspaceId =
    workspaceId ??
    (activeWorkspaceId ? String(activeWorkspaceId) : workspaces[0]?.id ? String(workspaces[0].id) : undefined)

  const [addWorkspaceOpen, setAddWorkspaceOpen] = useState(false)
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false)
  const [profilePanelOpen, setProfilePanelOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
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

  const currentWorkspace = workspaceId
    ? workspaces.find((ws) => ws.id === Number(workspaceId))
    : workspaces.find((ws) => ws.id === activeWorkspaceId)

  const navWorkspace =
    currentWorkspace ??
    workspaces.find((ws) => ws.id === Number(effectiveWorkspaceId))

  const visibleSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            const area = item.focusArea ?? section.focusArea
            if (area && !workspaceHasFocus(navWorkspace, area)) {
              return false
            }
            if (item.requireAnyManage) {
              return (
                canManageWorkspace(navWorkspace, 'planning') ||
                canManageWorkspace(navWorkspace, 'finances')
              )
            }
            if (item.requireManage && area && !canManageWorkspace(navWorkspace, area)) {
              return false
            }
            return true
          }),
        }))
        .filter(
          (section) =>
            section.items.length > 0 &&
            (!section.focusArea || workspaceHasFocus(navWorkspace, section.focusArea)),
        ),
    [navWorkspace],
  )

  const visibleMobileTabs = useMemo(
    () =>
      mobileTabItems.filter(
        (item) => !item.focusArea || workspaceHasFocus(navWorkspace, item.focusArea),
      ),
    [navWorkspace],
  )

  useEffect(() => {
    if (!token) return

    let connectionId: number | undefined
    const timeoutId = window.setTimeout(() => {
      connectionId = connect(token)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      if (connectionId !== undefined) disconnect(connectionId)
    }
  }, [token, workspaceIds.join(','), connect, disconnect])

  useLayoutEffect(() => {
    if (isCentralCalendar) {
      syncCalendarWorkspaces(workspaceIds)
    }
  }, [isCentralCalendar, workspaceIds, syncCalendarWorkspaces])

  useEffect(() => {
    if (isCentralCalendar || !workspaceId || workspaces.length === 0) return

    const numericWorkspaceId = Number(workspaceId)
    if (Number.isNaN(numericWorkspaceId)) return

    const workspace = workspaces.find((ws) => ws.id === numericWorkspaceId)
    if (!workspace) {
      navigate('/calendar', { replace: true })
      return
    }

    if (activeWorkspaceId !== numericWorkspaceId) {
      setActiveWorkspace(numericWorkspaceId)
    }
  }, [
    isCentralCalendar,
    workspaceId,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    navigate,
  ])

  useEffect(() => {
    if (isCentralCalendar || !workspaceId || !currentWorkspace) return
    if (!isWorkspaceRouteAllowed(location.pathname, workspaceId, currentWorkspace)) {
      navigate(`/w/${workspaceId}/calendar`, { replace: true })
    }
  }, [location.pathname, workspaceId, currentWorkspace, navigate])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname, workspaceId])

  useEffect(() => {
    if (!mobileNavOpen) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setMobileNavOpen(false)
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [mobileNavOpen])

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

  function handleCentralCalendarClick() {
    setMobileNavOpen(false)
    navigate('/calendar')
  }

  function renderCentralCalendarButton(compact = false) {
    return (
      <button
        type="button"
        title="All calendars"
        onClick={handleCentralCalendarClick}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-2xl transition',
          compact ? 'h-10 w-10' : 'h-11 w-11',
          isCentralCalendar
            ? 'bg-primary text-primary-foreground'
            : 'bg-white/10 hover:bg-white/20',
        )}
      >
        <CalendarDays className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </button>
    )
  }

  function handleWorkspaceClick(workspace: (typeof workspaces)[number]) {
    if (Number(workspaceId) === workspace.id && !isCentralCalendar) {
      setWorkspacePanelOpen(true)
      setMobileNavOpen(false)
      return
    }

    setActiveWorkspace(workspace.id)
    const suffix = isCentralCalendar ? 'calendar' : workspaceRouteSuffix(location.pathname)
    navigate(`/w/${workspace.id}/${suffix}`)
  }

  function handleLogout() {
    disconnect()
    logout()
    navigate('/login')
  }

  function isMobileTabActive(item: NavItem) {
    if (!effectiveWorkspaceId) return false
    const base = `/w/${effectiveWorkspaceId}/`
    if (item.to.startsWith('planner/')) return location.pathname.startsWith(`${base}planner/`)
    if (item.to.startsWith('finances/')) return location.pathname.startsWith(`${base}finances/`)
    return location.pathname === `${base}${item.to}` || location.pathname.startsWith(`${base}${item.to}/`)
  }

  function renderCentralCalendarNav() {
    return (
      <WorkspaceChecklist
        workspaces={workspaces}
        selectedIds={selectedCalendarWorkspaceIds}
        onToggle={toggleCalendarWorkspace}
        onSelectAll={() => selectAllCalendarWorkspaces(workspaceIds)}
      />
    )
  }

  function renderNavLinks(onNavigate?: () => void) {
    if (!effectiveWorkspaceId) {
      return null
    }

    return visibleSections.map((section, sectionIndex) => {
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
                const itemPath = `/w/${effectiveWorkspaceId}/${to}`
                return (
                  <NavLink
                    key={to}
                    to={itemPath}
                    end={!matchSubpaths}
                    onClick={onNavigate}
                    className={({ isActive }) => {
                      const active =
                        isActive ||
                        (matchSubpaths &&
                          (location.pathname === itemPath ||
                            location.pathname.startsWith(`${itemPath}/`)))
                      return cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition md:py-2',
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
    })
  }

  function renderWorkspaceButtons(compact = false) {
    return (
      <>
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            title={Number(workspaceId) === workspace.id ? `${workspace.name} · members & invites` : workspace.name}
            onClick={() => handleWorkspaceClick(workspace)}
            className={cn(
              'flex shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition',
              compact ? 'h-10 w-10' : 'h-11 w-11',
              Number(workspaceId) === workspace.id && !isCentralCalendar
                ? 'bg-primary text-primary-foreground'
                : 'bg-white/10 hover:bg-white/20',
            )}
          >
            {workspaceInitials(workspace.name)}
          </button>
        ))}
        <button
          type="button"
          className={cn(
            'flex shrink-0 items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20',
            compact ? 'h-10 w-10' : 'h-11 w-11',
          )}
          title="Add workspace"
          onClick={() => {
            setAddWorkspaceOpen(true)
            setMobileNavOpen(false)
          }}
        >
          <Plus className="h-5 w-5" />
        </button>
      </>
    )
  }

  const homePath = '/calendar'

  return (
    <>
      <div className="flex h-dvh flex-col overflow-hidden overscroll-none bg-background text-foreground">
        <header className="z-30 flex shrink-0 items-center gap-2 border-b bg-background px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-muted"
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-base font-semibold"
            onClick={() => {
              if (isCentralCalendar) {
                setMobileNavOpen(true)
                return
              }
              if (currentWorkspace) setWorkspacePanelOpen(true)
            }}
          >
            {isCentralCalendar ? 'All calendars' : (currentWorkspace?.name ?? 'Home')}
          </button>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1">
          <aside className="hidden w-[72px] shrink-0 flex-col items-center gap-2 border-r bg-[#1a1d21] py-3 text-white md:flex">
            {renderCentralCalendarButton()}

            <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  title={Number(workspaceId) === workspace.id ? `${workspace.name} · members & invites` : workspace.name}
                  onClick={() => handleWorkspaceClick(workspace)}
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition',
                    Number(workspaceId) === workspace.id && !isCentralCalendar
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white/10 hover:bg-white/20',
                  )}
                >
                  {workspaceInitials(workspace.name)}
                </button>
              ))}
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20"
                title="Add workspace"
                onClick={() => setAddWorkspaceOpen(true)}
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-auto w-full shrink-0">
              <UserMenu
                connected={connected}
                onOpenSettings={() => setProfilePanelOpen(true)}
                onLogout={handleLogout}
              />
            </div>
          </aside>

          <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/20 md:flex">
            <div className="space-y-1 border-b px-4 py-3">
              <ProductBrandHeader to={homePath} />
              {isCentralCalendar ? (
                <div
                  className="flex min-w-0 items-center gap-1.5 px-0.5"
                  title={connected ? 'Live sync connected' : 'Live sync disconnected'}
                >
                  {connected ? (
                    <Wifi className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="truncate text-sm font-medium text-muted-foreground">All calendars</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5 text-left hover:underline"
                  title={connected ? 'Live sync connected' : 'Live sync disconnected'}
                  onClick={() => currentWorkspace && setWorkspacePanelOpen(true)}
                >
                  {connected ? (
                    <Wifi className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="truncate text-sm font-medium text-muted-foreground">
                    {currentWorkspace?.name ?? 'Home'}
                  </span>
                </button>
              )}
            </div>

            <nav className="flex-1 overflow-y-auto p-3">
              {isCentralCalendar ? renderCentralCalendarNav() : renderNavLinks()}
            </nav>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <RealtimeQuerySync />
            <RealtimeToastSync />
            <DueDateToastSync />
            <Outlet key={workspaceId ?? location.pathname} />
          </main>
        </div>

        {!isCentralCalendar ? (
        <nav
          className="flex shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label="Primary"
        >
          {visibleMobileTabs.map((item) => {
            const Icon = item.icon
            const active = isMobileTabActive(item)
            return (
              <NavLink
                key={item.to}
                to={`/w/${effectiveWorkspaceId}/${item.to}`}
                className={cn(
                  'flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
        ) : null}
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative flex h-full w-[min(20rem,88vw)] flex-col bg-background shadow-xl">
            <div className="space-y-1 border-b px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="flex items-center justify-between gap-2">
                <ProductBrandHeader to={homePath} className="min-w-0 flex-1" />
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
                  aria-label="Close navigation"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {isCentralCalendar ? (
                <div
                  className="flex min-w-0 items-center gap-1.5 px-0.5"
                  title={connected ? 'Live sync connected' : 'Live sync disconnected'}
                >
                  {connected ? (
                    <Wifi className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="truncate text-sm font-medium text-muted-foreground">All calendars</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5 text-left"
                  onClick={() => {
                    if (currentWorkspace) setWorkspacePanelOpen(true)
                    setMobileNavOpen(false)
                  }}
                >
                  {connected ? (
                    <Wifi className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="truncate text-sm font-medium text-muted-foreground">
                    {currentWorkspace?.name ?? 'Home'}
                  </span>
                </button>
              )}
            </div>

            <div className="border-b bg-[#1a1d21] px-3 py-3 text-white">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/60">Overview</p>
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {renderCentralCalendarButton(true)}
              </div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/60">Workspaces</p>
              <div className="flex gap-2 overflow-x-auto pb-1">{renderWorkspaceButtons(true)}</div>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {isCentralCalendar
                ? renderCentralCalendarNav()
                : renderNavLinks(() => setMobileNavOpen(false))}
            </nav>

            <div className="border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <UserMenu
                variant="header"
                connected={connected}
                onOpenSettings={() => {
                  setProfilePanelOpen(true)
                  setMobileNavOpen(false)
                }}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </div>
      ) : null}

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
            navigate('/calendar')
          }
        }}
      />
    </>
  )
}
