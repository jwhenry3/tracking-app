import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  createWorkspace,
  fetchMe,
  fetchWorkspaces,
  login as loginRequest,
  register as registerRequest,
} from '@/lib/api'
import type { CreateWorkspaceResult, User, Workspace, WorkspaceFocusArea } from '@/lib/types'

type AuthState = {
  token: string | null
  username: string | null
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  avatarVersion: number
  settings: Record<string, unknown>
  workspaces: Workspace[]
  activeWorkspaceId: number | null
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, workspaceName?: string, email?: string) => Promise<void>
  hydrate: () => Promise<void>
  loadWorkspaces: () => Promise<void>
  createWorkspace: (name: string, message?: string, focusAreas?: WorkspaceFocusArea[]) => Promise<CreateWorkspaceResult>
  updateWorkspace: (workspace: Workspace) => void
  applyUser: (user: User) => void
  setActiveWorkspace: (workspaceId: number) => void
  logout: () => void
  clearError: () => void
}

function applyUserToState(user: User) {
  return {
    username: user.username,
    email: user.email ?? null,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    settings: user.settings ?? {},
    avatarVersion: Date.now(),
  }
}

const emptyAuth = {
  token: null,
  username: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  avatarVersion: 0,
  settings: {},
  workspaces: [],
  activeWorkspaceId: null,
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...emptyAuth,
      isLoading: false,
      error: null,

      login: async (username, password) => {
        set({ isLoading: true, error: null })
        try {
          const data = await loginRequest(username, password)
          set({ token: data.token, isLoading: false })
          const user = await fetchMe(data.token)
          set({ ...applyUserToState(user), isLoading: false })
          await get().loadWorkspaces()
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Login failed',
          })
          throw error
        }
      },

      register: async (username, password, workspaceName, email) => {
        set({ isLoading: true, error: null })
        try {
          const data = await registerRequest(username, password, workspaceName, email)
          set({ token: data.token, isLoading: false })
          const user = await fetchMe(data.token)
          set({ ...applyUserToState(user), isLoading: false })
          await get().loadWorkspaces()
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Registration failed',
          })
          throw error
        }
      },

      hydrate: async () => {
        const { token } = get()
        if (!token) return

        set({ isLoading: true, error: null })
        try {
          const user = await fetchMe(token)
          set({ ...applyUserToState(user), isLoading: false })
          await get().loadWorkspaces()
        } catch {
          set({
            ...emptyAuth,
            isLoading: false,
          })
        }
      },

      loadWorkspaces: async () => {
        const { token, activeWorkspaceId } = get()
        if (!token) return

        const data = await fetchWorkspaces(token)
        const nextActive =
          activeWorkspaceId && data.workspaces.some((ws) => ws.id === activeWorkspaceId)
            ? activeWorkspaceId
            : data.workspaces[0]?.id ?? null

        set({ workspaces: data.workspaces, activeWorkspaceId: nextActive })
      },

      createWorkspace: async (name, message, focusAreas) => {
        const { token } = get()
        if (!token) throw new Error('Not authenticated')

        const result = await createWorkspace(token, name, message, focusAreas)
        if (result.status === 'created' || result.status === 'already_member') {
          set((state) => ({
            workspaces: state.workspaces.some((ws) => ws.id === result.workspace.id)
              ? state.workspaces.map((ws) =>
                  ws.id === result.workspace.id ? result.workspace : ws,
                )
              : [...state.workspaces, result.workspace],
            activeWorkspaceId: result.workspace.id,
          }))
        }
        return result
      },

      updateWorkspace: (workspace) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => (ws.id === workspace.id ? workspace : ws)),
        }))
      },

      applyUser: (user) => {
        set((state) => ({
          ...applyUserToState(user),
          ...(user.token ? { token: user.token } : {}),
          avatarVersion:
            state.avatarUrl !== user.avatar_url ? Date.now() : state.avatarVersion,
        }))
      },

      setActiveWorkspace: (workspaceId) => set({ activeWorkspaceId: workspaceId }),

      logout: () => {
        set({
          ...emptyAuth,
          error: null,
        })
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        username: state.username,
        email: state.email,
        displayName: state.displayName,
        avatarUrl: state.avatarUrl,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    },
  ),
)
