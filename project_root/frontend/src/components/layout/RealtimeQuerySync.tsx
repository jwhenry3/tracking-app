import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'

import { invalidateWorkspaceEntity } from '@/lib/queries/invalidate'
import {
  applyUserProfileUpdate,
  invalidateUserProfileQueries,
  type UserProfileUpdatePayload,
} from '@/lib/queries/userProfileSync'
import { queryKeys } from '@/lib/queries/keys'
import { useAuthStore } from '@/stores/authStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

export function RealtimeQuerySync() {
  const { workspaceId } = useParams()
  const queryClient = useQueryClient()
  const subscribe = useRealtimeStore((state) => state.subscribe)
  const loadWorkspaces = useAuthStore((state) => state.loadWorkspaces)
  const applyUser = useAuthStore((state) => state.applyUser)
  const currentUserId = useAuthStore((state) => state.userId)

  useEffect(() => {
    return subscribe((payload) => {
      const message = payload as {
        entity?: string
        action?: string
        workspace_id?: number
        conversation_id?: number
        payload?: UserProfileUpdatePayload & { conversation_id?: number }
      }
      const routeWorkspaceId = workspaceId ? Number(workspaceId) : null
      const messageWorkspaceId = message.workspace_id ?? routeWorkspaceId

      if (message.entity === 'workspace' || message.entity === 'member') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() })
        void loadWorkspaces()
        return
      }

      if (
        message.entity === 'user_profile'
        && message.action === 'updated'
        && messageWorkspaceId
        && message.payload
      ) {
        const profile = message.payload

        if (profile.previous_username) {
          void invalidateUserProfileQueries(queryClient, messageWorkspaceId)
        } else {
          applyUserProfileUpdate(queryClient, messageWorkspaceId, profile)
        }

        if (profile.user_id === currentUserId) {
          applyUser({
            id: profile.user_id,
            username: profile.username,
            display_name: profile.display_name,
            email: useAuthStore.getState().email,
            avatar_url: useAuthStore.getState().avatarUrl,
            settings: useAuthStore.getState().settings,
            ...(profile.previous_username ? {} : {}),
          })
        }
        return
      }

      if (!messageWorkspaceId) return

      void invalidateWorkspaceEntity(queryClient, messageWorkspaceId, message.entity)

      const conversationId =
        message.conversation_id ?? message.payload?.conversation_id
      if (
        (message.entity === 'chat' || message.entity === 'chat_message' || message.entity === 'message')
        && conversationId
      ) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.chatMessages(messageWorkspaceId, conversationId),
        })
      }
    })
  }, [subscribe, workspaceId, queryClient, loadWorkspaces, applyUser, currentUserId])

  return null
}
