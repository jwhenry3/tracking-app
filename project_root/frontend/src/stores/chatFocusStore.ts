import { create } from 'zustand'

type ChatFocusState = {
  workspaceId: number | null
  conversationId: number | null
  setFocus: (workspaceId: number | null, conversationId: number | null) => void
}

export const useChatFocusStore = create<ChatFocusState>((set) => ({
  workspaceId: null,
  conversationId: null,
  setFocus: (workspaceId, conversationId) => set({ workspaceId, conversationId }),
}))
