import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'

import { invalidateWorkspaceEntity } from '@/lib/queries/invalidate'
import { queryKeys } from '@/lib/queries/keys'
import { useAuthStore } from '@/stores/authStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

export function RealtimeQuerySync() {
  const { workspaceId } = useParams()
  const queryClient = useQueryClient()
  const subscribe = useRealtimeStore((state) => state.subscribe)
  const loadWorkspaces = useAuthStore((state) => state.loadWorkspaces)

  useEffect(() => {
    return subscribe((payload) => {
      const message = payload as {
        entity?: string
        conversation_id?: number
        payload?: { conversation_id?: number }
      }
      const numericWorkspaceId = workspaceId ? Number(workspaceId) : null

      if (message.entity === 'workspace' || message.entity === 'member') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() })
        void loadWorkspaces()
        return
      }

      if (!numericWorkspaceId) return

      void invalidateWorkspaceEntity(queryClient, numericWorkspaceId, message.entity)

      const conversationId =
        message.conversation_id ?? message.payload?.conversation_id
      if (
        (message.entity === 'chat' || message.entity === 'chat_message' || message.entity === 'message')
        && conversationId
      ) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.chatMessages(numericWorkspaceId, conversationId),
        })
      }
    })
  }, [subscribe, workspaceId, queryClient, loadWorkspaces])

  return null
}
