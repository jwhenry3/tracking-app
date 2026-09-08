import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { createWorkspace, fetchMe, fetchWorkspaces, login as loginRequest, register as registerRequest } from '@/lib/api'
import type { Workspace } from '@/lib/types'

type AuthState = {
  token: string | null
  username: string | null
  workspaces: Workspace[]
  activeWorkspaceId: number | null
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, workspaceName?: string) => Promise<void>
  hydrate: () => Promise<void>
  loadWorkspaces: () => Promise<void>
  createWorkspace: (name: string) => Promise<Workspace>
  setActiveWorkspace: (workspaceId: number) => void
  logout: () => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      workspaces: [],
      activeWorkspaceId: null,
      isLoading: false,
      error: null,

      login: async (username, password) => {
        set({ isLoading: true, error: null })
        try {
          const data = await loginRequest(username, password)
          set({ token: data.token, username: data.username, isLoading: false })
          await get().loadWorkspaces()
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Login failed',
          })
          throw error
        }
      },

      register: async (username, password, workspaceName) => {
        set({ isLoading: true, error: null })
        try {
          const data = await registerRequest(username, password, workspaceName)
          set({ token: data.token, username: data.username, isLoading: false })
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
          set({ username: user.username, isLoading: false })
          await get().loadWorkspaces()
        } catch {
          set({ token: null, username: null, workspaces: [], activeWorkspaceId: null, isLoading: false })
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

      createWorkspace: async (name) => {
        const { token } = get()
        if (!token) throw new Error('Not authenticated')

        const workspace = await createWorkspace(token, name)
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
          activeWorkspaceId: workspace.id,
        }))
        return workspace
      },

      setActiveWorkspace: (workspaceId) => set({ activeWorkspaceId: workspaceId }),

      logout: () => {
        set({
          token: null,
          username: null,
          workspaces: [],
          activeWorkspaceId: null,
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
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    },
  ),
)
