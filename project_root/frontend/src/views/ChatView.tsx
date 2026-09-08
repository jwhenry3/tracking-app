import { useQueryClient } from '@tanstack/react-query'
import { type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, Send, Users } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { ChatMessageAttachments, PendingChatFiles } from '@/components/chat/ChatAttachments'
import { PageHeader } from '@/components/layout/PageHeader'
import { MarkdownContent } from '@/components/notes/MarkdownContent'
import { MarkdownEditor } from '@/components/notes/MarkdownEditor'
import { Button } from '@/components/ui/button'
import {
  createDirectConversation,
  sendChatMessage,
} from '@/lib/api'
import { dataTransferHasFiles, filesFromList } from '@/lib/files'
import { queryKeys } from '@/lib/queries/keys'
import {
  useChatConversationsQuery,
  useChatMessagesQuery,
  useWorkspaceMembersQuery,
} from '@/lib/queries/hooks'
import type { ChatConversation } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

const maxChatAttachments = 8
const maxChatAttachmentBytes = 10 * 1024 * 1024

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
      && conversation.members?.length === 2
      && conversation.members.includes(memberUsername)
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
  const queryClient = useQueryClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const workspaceNumericId = workspaceId ? Number(workspaceId) : null
  const queriesEnabled = Boolean(token && workspaceNumericId)
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conversationsQuery = useChatConversationsQuery(workspaceNumericId, queriesEnabled)
  const membersQuery = useWorkspaceMembersQuery(workspaceNumericId)
  const messagesQuery = useChatMessagesQuery(
    workspaceNumericId,
    activeConversationId,
    queriesEnabled && Boolean(activeConversationId),
  )

  const conversations = conversationsQuery.data ?? []
  const members = membersQuery.data?.members ?? []
  const messages = messagesQuery.data ?? []
  const loading = conversationsQuery.isLoading
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

  async function refreshChat(conversationId?: number | null) {
    if (!workspaceNumericId) return
    await queryClient.invalidateQueries({
      queryKey: queryKeys.chatConversations(workspaceNumericId),
    })
    if (conversationId) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.chatMessages(workspaceNumericId, conversationId),
      })
    }
  }

  useEffect(() => {
    if (!conversations.length) return
    const savedConversationId = workspaceId
      ? Number(sessionStorage.getItem(chatStorageKey(workspaceId)))
      : NaN
    setActiveConversationId((current) => {
      if (current && conversations.some((conversation) => conversation.id === current)) {
        return current
      }
      if (Number.isFinite(savedConversationId) && conversations.some((conversation) => conversation.id === savedConversationId)) {
        return savedConversationId
      }
      const group = conversations.find((conversation) => conversation.kind === 'group')
      return group?.id ?? conversations[0]?.id ?? null
    })
  }, [conversations, workspaceId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  function addFiles(incoming: File[]) {
    if (incoming.length === 0) return
    setError(null)
    setPendingFiles((current) => {
      const next = [...current]
      for (const file of incoming) {
        if (file.size > maxChatAttachmentBytes) {
          setError(`${file.name} is larger than 10MB`)
          continue
        }
        if (next.length >= maxChatAttachments) {
          setError(`At most ${maxChatAttachments} attachments are allowed`)
          break
        }
        next.push(file)
      }
      return next
    })
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
    addFiles(filesFromList(event.dataTransfer.files))
  }

  async function handleSend(event?: FormEvent) {
    event?.preventDefault()
    if (!token || !workspaceNumericId || !activeConversationId || sending) return
    const content = draft.trim()
    const files = pendingFiles
    if (!content && files.length === 0) return

    setDraft('')
    setPendingFiles([])
    setError(null)
    setSending(true)
    try {
      await sendChatMessage(token, workspaceNumericId, activeConversationId, content, files)
      await refreshChat(activeConversationId)
    } catch (err) {
      setDraft(content)
      setPendingFiles(files)
      setError(err instanceof Error ? err.message : 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  async function openMemberChat(memberUsername: string) {
    if (!token || !workspaceNumericId) return

    const existing = findDirectConversation(directConversations, memberUsername, username)
    if (existing) {
      selectConversation(existing.id)
      return
    }

    const conversation = await createDirectConversation(token, workspaceNumericId, memberUsername)
    await refreshChat(conversation.id)
    selectConversation(conversation.id)
  }

  if (!token || !workspaceId || !workspaceNumericId) {
    return null
  }

  const canSend = Boolean(activeConversationId) && !sending && (Boolean(draft.trim()) || pendingFiles.length > 0)
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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader icon={MessageSquare} title="Chat" subtitle="Group and direct messages" className="shrink-0" />

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
                        {message.content.trim() ? (
                          <MarkdownContent
                            content={message.content}
                            breaks
                            className="markdown-compact mt-1 text-foreground"
                          />
                        ) : null}
                        <ChatMessageAttachments
                          attachments={message.attachments ?? []}
                          workspaceId={workspaceNumericId}
                          token={token}
                        />
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <form
            className="border-t px-4 py-3"
            onSubmit={(event) => void handleSend(event)}
            onDragOver={(event) => {
              if (!dataTransferHasFiles(event.dataTransfer)) return
              event.preventDefault()
            }}
            onDrop={handleDrop}
          >
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <MarkdownEditor
                  compact
                  defaultMode="preview"
                  value={draft}
                  onChange={setDraft}
                  onFiles={addFiles}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder={activeConversationId ? 'Write a message' : 'Select a conversation first'}
                  disabled={!activeConversationId || sending}
                />
                <PendingChatFiles
                  files={pendingFiles}
                  onRemove={(index) => setPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                />
                {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
              </div>
              <Button type="submit" disabled={!canSend} className="shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
