import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { MessageSquare, Send, Users } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  createDirectConversation,
  fetchChatConversations,
  fetchChatMessages,
  fetchWorkspaceMembers,
  sendChatMessage,
} from '@/lib/api'
import type { ChatConversation, ChatMessage, WorkspaceMember } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useRealtimeStore } from '@/stores/realtimeStore'

function findDirectConversation(
  conversations: ChatConversation[],
  memberUsername: string,
  currentUsername: string | null,
) {
  if (memberUsername === currentUsername) {
    return conversations.find(
      (conversation) =>
        conversation.kind === 'direct'
        && conversation.members?.length === 1
        && conversation.members[0] === currentUsername,
    )
  }
  return conversations.find(
    (conversation) =>
      conversation.kind === 'direct'
      && conversation.members?.includes(memberUsername)
      && conversation.members.includes(currentUsername ?? ''),
  )
}

function directLabel(memberUsername: string, currentUsername: string | null) {
  if (memberUsername === currentUsername) {
    return `${memberUsername} (you)`
  }
  return memberUsername
}

function chatStorageKey(workspaceId: string) {
  return `chat-active-${workspaceId}`
}

export function ChatView() {
  const { workspaceId } = useParams()
  const token = useAuthStore((s) => s.token)
  const username = useAuthStore((s) => s.username)
  const setOnUpdate = useRealtimeStore((s) => s.setOnUpdate)

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)

  const workspaceNumericId = Number(workspaceId)
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )

  const groupConversation = conversations.find((conversation) => conversation.kind === 'group')
  const directConversations = conversations.filter((conversation) => conversation.kind === 'direct')

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => {
      if (a.username === username) return -1
      if (b.username === username) return 1
      return a.username.localeCompare(b.username)
    }),
    [members, username],
  )

  function selectConversation(conversationId: number) {
    setActiveConversationId(conversationId)
    if (workspaceId) {
      sessionStorage.setItem(chatStorageKey(workspaceId), String(conversationId))
    }
  }

  async function loadConversations() {
    if (!token || !workspaceId) return
    const [conversationData, memberData] = await Promise.all([
      fetchChatConversations(token, workspaceNumericId),
      fetchWorkspaceMembers(token, workspaceNumericId),
    ])
    setConversations(conversationData.conversations)
    setMembers(memberData.members)
    const savedConversationId = workspaceId
      ? Number(sessionStorage.getItem(chatStorageKey(workspaceId)))
      : NaN
    setActiveConversationId((current) => {
      if (current && conversationData.conversations.some((conversation) => conversation.id === current)) {
        return current
      }
      if (Number.isFinite(savedConversationId) && conversationData.conversations.some((conversation) => conversation.id === savedConversationId)) {
        return savedConversationId
      }
      const group = conversationData.conversations.find((conversation) => conversation.kind === 'group')
      return group?.id ?? conversationData.conversations[0]?.id ?? null
    })
    setLoading(false)
  }

  async function loadMessages(conversationId: number) {
    if (!token || !workspaceId) return
    const data = await fetchChatMessages(token, workspaceNumericId, conversationId)
    setMessages(data.messages)
  }

  useEffect(() => {
    void loadConversations()
  }, [token, workspaceId])

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }
    void loadMessages(activeConversationId)
  }, [activeConversationId, token, workspaceId])

  useEffect(() => {
    setOnUpdate((payload) => {
      const update = payload as { entity?: string; payload?: ChatMessage }
      if (update.entity === 'message' && update.payload?.conversation_id === activeConversationId) {
        setMessages((current) => {
          if (current.some((message) => message.id === update.payload?.id)) {
            return current
          }
          return update.payload ? [...current, update.payload] : current
        })
        return
      }
      void loadConversations()
      if (activeConversationId) {
        void loadMessages(activeConversationId)
      }
    })
    return () => setOnUpdate(null)
  }, [activeConversationId, token, workspaceId])

  async function handleSend(event?: FormEvent) {
    event?.preventDefault()
    if (!token || !workspaceId || !activeConversationId || !draft.trim()) return
    const content = draft.trim()
    setDraft('')
    await sendChatMessage(token, workspaceNumericId, activeConversationId, content)
    await loadMessages(activeConversationId)
  }

  async function openMemberChat(memberUsername: string) {
    if (!token || !workspaceId) return

    const existing = findDirectConversation(directConversations, memberUsername, username)
    if (existing) {
      selectConversation(existing.id)
      return
    }

    const conversation = await createDirectConversation(token, workspaceNumericId, memberUsername)
    await loadConversations()
    selectConversation(conversation.id)
  }

  if (!token || !workspaceId) {
    return null
  }

  const activeTitle = activeConversation
    ? activeConversation.kind === 'direct'
      ? (() => {
          if (activeConversation.members?.length === 1 && activeConversation.members[0] === username) {
            return directLabel(username ?? '', username)
          }
          const other = activeConversation.members?.find((member) => member !== username)
          return other ? directLabel(other, username) : activeConversation.title
        })()
      : activeConversation.title
    : 'Select a conversation'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader icon={MessageSquare} title="Chat" subtitle="Group and direct messages" />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r bg-muted/10">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Group</p>
            {loading ? <p className="px-2 text-sm text-muted-foreground">Loading…</p> : null}
            {groupConversation ? (
              <button
                type="button"
                onClick={() => selectConversation(groupConversation.id)}
                className={cn(
                  'mb-4 flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition',
                  activeConversationId === groupConversation.id ? 'bg-primary/10 text-foreground' : 'hover:bg-muted',
                )}
              >
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{groupConversation.title}</p>
                  <p className="text-xs text-muted-foreground">Everyone in workspace</p>
                </div>
              </button>
            ) : (
              <p className="mb-4 px-2 text-sm text-muted-foreground">No group chat yet.</p>
            )}

            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Direct messages</p>
            {sortedMembers.length === 0 ? (
              <p className="mb-4 px-2 text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <div className="mb-4 space-y-1">
                {sortedMembers.map((member) => {
                  const conversation = findDirectConversation(directConversations, member.username, username)
                  const isSelf = member.username === username
                  const isActive = conversation ? activeConversationId === conversation.id : false

                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      onClick={() => void openMemberChat(member.username)}
                      className={cn(
                        'flex w-full rounded-lg px-2 py-2.5 text-left text-sm transition',
                        isActive ? 'bg-primary/10 text-foreground' : 'hover:bg-muted',
                        isSelf && !isActive && 'opacity-90',
                      )}
                    >
                      <p className="truncate font-medium">{directLabel(member.username, username)}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{activeTitle}</h2>
            {activeConversation?.kind === 'group' ? (
              <p className="text-xs text-muted-foreground">Workspace group chat</p>
            ) : activeConversation ? (
              <p className="text-xs text-muted-foreground">Direct message</p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!activeConversationId ? (
              <p className="text-sm text-muted-foreground">Choose a conversation from the left panel.</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => {
                  const mine = message.sender_username === username
                  return (
                    <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[80%] rounded-lg border px-3 py-2', mine ? 'bg-primary/10' : 'bg-muted/40')}>
                        <p className="text-xs font-medium text-muted-foreground">{message.sender_username}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{message.content}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <form className="flex gap-2 border-t px-4 py-3" onSubmit={(event) => void handleSend(event)}>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void handleSend()
                }
              }}
              placeholder={activeConversationId ? 'Write a message' : 'Select a conversation first'}
              rows={2}
              disabled={!activeConversationId}
              className="min-h-[72px] flex-1"
            />
            <Button type="submit" disabled={!activeConversationId || !draft.trim()} className="self-end">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </section>
      </div>
    </div>
  )
}
