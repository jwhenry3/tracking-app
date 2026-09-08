import { create } from 'zustand'

import { getWebSocketUrl } from '@/lib/api'

type RealtimeState = {
  connected: boolean
  socket: WebSocket | null
  connectionId: number
  connect: (token: string, workspaceId: number) => number
  disconnect: (connectionId?: number) => void
  onUpdate: ((payload: unknown) => void) | null
  setOnUpdate: (handler: ((payload: unknown) => void) | null) => void
  subscribe: (handler: (payload: unknown) => void) => () => void
}

let nextConnectionId = 0
const updateSubscribers = new Set<(payload: unknown) => void>()

function notifyUpdateSubscribers(payload: unknown) {
  updateSubscribers.forEach((handler) => handler(payload))
}

function closeSocket(socket: WebSocket) {
  socket.onopen = null
  socket.onclose = null
  socket.onerror = null
  socket.onmessage = null
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close()
  }
}

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  connected: false,
  socket: null,
  connectionId: 0,
  onUpdate: null,

  setOnUpdate: (handler) => set({ onUpdate: handler }),

  subscribe: (handler) => {
    updateSubscribers.add(handler)
    return () => {
      updateSubscribers.delete(handler)
    }
  },

  connect: (token, workspaceId) => {
    const { socket: existing } = get()
    if (existing) closeSocket(existing)

    const connectionId = ++nextConnectionId
    const socket = new WebSocket(getWebSocketUrl(token, workspaceId))

    socket.onopen = () => {
      if (get().connectionId !== connectionId) return
      set({ connected: true })
    }

    socket.onclose = () => {
      if (get().connectionId !== connectionId) return
      set({ connected: false, socket: null })
    }

    socket.onmessage = (event) => {
      if (get().connectionId !== connectionId) return
      try {
        const payload = JSON.parse(event.data)
        get().onUpdate?.(payload)
        notifyUpdateSubscribers(payload)
      } catch {
        // ignore malformed payloads
      }
    }

    set({ socket, connectionId, connected: false })
    return connectionId
  },

  disconnect: (connectionId) => {
    const state = get()
    if (connectionId !== undefined && connectionId !== state.connectionId) return
    if (state.socket) closeSocket(state.socket)
    set({ socket: null, connected: false })
  },
}))
