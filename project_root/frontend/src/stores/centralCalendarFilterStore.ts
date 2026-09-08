import { create } from 'zustand'

import {
  loadCentralCalendarWorkspaceFilter,
  saveCentralCalendarWorkspaceFilter,
  toggleCentralCalendarWorkspace,
} from '@/lib/centralCalendarWorkspaceFilter'

type CentralCalendarFilterStore = {
  selectedWorkspaceIds: number[]
  syncWorkspaces: (workspaceIds: number[]) => void
  setSelectedWorkspaceIds: (workspaceIds: number[]) => void
  toggleWorkspace: (workspaceId: number) => void
  selectAllWorkspaces: (workspaceIds: number[]) => void
}

export const useCentralCalendarFilterStore = create<CentralCalendarFilterStore>((set, get) => ({
  selectedWorkspaceIds: [],
  syncWorkspaces: (workspaceIds) => {
    if (workspaceIds.length === 0) {
      set({ selectedWorkspaceIds: [] })
      return
    }

    set((state) => {
      const allowed = new Set(workspaceIds)
      const current = state.selectedWorkspaceIds.filter((id) => allowed.has(id))
      const saved = loadCentralCalendarWorkspaceFilter(workspaceIds)
      const next = current.length > 0 ? current : saved
      return { selectedWorkspaceIds: next.length > 0 ? next : workspaceIds }
    })
  },
  setSelectedWorkspaceIds: (workspaceIds) => {
    saveCentralCalendarWorkspaceFilter(workspaceIds)
    set({ selectedWorkspaceIds: workspaceIds })
  },
  toggleWorkspace: (workspaceId) => {
    const next = toggleCentralCalendarWorkspace(get().selectedWorkspaceIds, workspaceId)
    saveCentralCalendarWorkspaceFilter(next)
    set({ selectedWorkspaceIds: next })
  },
  selectAllWorkspaces: (workspaceIds) => {
    saveCentralCalendarWorkspaceFilter(workspaceIds)
    set({ selectedWorkspaceIds: [...workspaceIds] })
  },
}))
