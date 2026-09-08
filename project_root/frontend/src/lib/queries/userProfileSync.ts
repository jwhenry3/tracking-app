import type { QueryClient } from '@tanstack/react-query'

import { queryKeys } from '@/lib/queries/keys'
import type { ChatConversation, ChatMessage, User, WorkspaceMember } from '@/lib/types'
import { getUserDisplayName } from '@/lib/userProfile'
import { queryClient } from '@/lib/queryClient'

export type UserProfileUpdatePayload = {
  user_id: number
  username: string
  display_name: string | null
  previous_username?: string
}

function resolvedDisplayName(profile: UserProfileUpdatePayload) {
  return getUserDisplayName({
    display_name: profile.display_name,
    username: profile.username,
  })
}

export function applyUserProfileUpdate(
  queryClient: QueryClient,
  workspaceId: number,
  profile: UserProfileUpdatePayload,
) {
  const displayName = resolvedDisplayName(profile)
  const memberUsername = profile.previous_username ?? profile.username

  queryClient.setQueriesData<{ members: WorkspaceMember[] }>(
    { queryKey: queryKeys.workspaceMembers(workspaceId) },
    (current) => {
      if (!current?.members) return current
      return {
        ...current,
        members: current.members.map((member) =>
          member.user_id === profile.user_id
            ? {
                ...member,
                username: profile.username,
                display_name: displayName,
              }
            : member,
        ),
      }
    },
  )

  queryClient.setQueriesData<ChatConversation[]>(
    { queryKey: queryKeys.chatConversations(workspaceId) },
    (current) => {
      if (!current) return current
      return current.map((conversation) => ({
        ...conversation,
        members: conversation.members?.map((member) =>
          member.username === memberUsername
            ? { username: profile.username, display_name: displayName }
            : member,
        ),
      }))
    },
  )

  queryClient.setQueriesData<ChatMessage[]>(
    {
      predicate: (query) =>
        query.queryKey[0] === 'chat-messages' && query.queryKey[1] === workspaceId,
    },
    (current) => {
      if (!current) return current
      return current.map((message) =>
        message.sender_id === profile.user_id
          ? {
              ...message,
              sender_username: profile.username,
              sender_display_name: displayName,
            }
          : message,
      )
    },
  )
}

export function syncLocalUserProfile(
  user: Pick<User, 'id' | 'username' | 'display_name'>,
  workspaceIds: number[],
) {
  for (const workspaceId of workspaceIds) {
    applyUserProfileUpdate(queryClient, workspaceId, {
      user_id: user.id,
      username: user.username,
      display_name: user.display_name,
    })
  }
}

export function invalidateUserProfileQueries(queryClient: QueryClient, workspaceId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaceMembers(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations(workspaceId) }),
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'chat-messages' && query.queryKey[1] === workspaceId,
    }),
  ])
}
