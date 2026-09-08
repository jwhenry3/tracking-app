import { Download, FileText, Paperclip, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { fetchChatAttachmentBlob } from '@/lib/api'
import type { ChatAttachment } from '@/lib/types'
import { cn, formatBytes } from '@/lib/utils'

type ChatMessageAttachmentsProps = {
  attachments: ChatAttachment[]
  workspaceId: number
  token: string
}

export function ChatMessageAttachments({ attachments, workspaceId, token }: ChatMessageAttachmentsProps) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="mt-2 space-y-2">
      {attachments.map((attachment) => (
        attachment.mime_type.startsWith('image/') ? (
          <ChatImageAttachment
            key={attachment.id}
            attachment={attachment}
            workspaceId={workspaceId}
            token={token}
          />
        ) : (
          <ChatFileAttachment
            key={attachment.id}
            attachment={attachment}
            workspaceId={workspaceId}
            token={token}
          />
        )
      ))}
    </div>
  )
}

function ChatImageAttachment({
  attachment,
  workspaceId,
  token,
}: {
  attachment: ChatAttachment
  workspaceId: number
  token: string
}) {
  const url = useAttachmentBlobUrl(token, workspaceId, attachment.id)

  if (!url) {
    return (
      <p className="text-xs text-muted-foreground">Loading {attachment.original_name}…</p>
    )
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img
        src={url}
        alt={attachment.original_name}
        className="max-h-64 max-w-full rounded-md border object-contain"
      />
    </a>
  )
}

function ChatFileAttachment({
  attachment,
  workspaceId,
  token,
}: {
  attachment: ChatAttachment
  workspaceId: number
  token: string
}) {
  const [downloading, setDownloading] = useState(false)

  async function download() {
    setDownloading(true)
    try {
      const blob = await fetchChatAttachmentBlob(token, workspaceId, attachment.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.original_name
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={downloading}
      className="flex w-full items-center gap-2 rounded-md border bg-background/70 px-2.5 py-2 text-left text-xs hover:bg-background"
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{attachment.original_name}</span>
      <span className="shrink-0 text-muted-foreground">{formatBytes(attachment.size_bytes)}</span>
      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  )
}

function useAttachmentBlobUrl(token: string, workspaceId: number, attachmentId: number) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    void fetchChatAttachmentBlob(token, workspaceId, attachmentId)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [token, workspaceId, attachmentId])

  return url
}

type PendingChatFilesProps = {
  files: File[]
  onRemove: (index: number) => void
}

export function PendingChatFiles({ files, onRemove }: PendingChatFilesProps) {
  if (files.length === 0) {
    return null
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((file, index) => (
        <PendingFileChip key={`${file.name}-${file.size}-${index}`} file={file} onRemove={() => onRemove(index)} />
      ))}
    </div>
  )
}

function PendingFileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
      {preview ? (
        <img src={preview} alt="" className="h-8 w-8 rounded object-cover" />
      ) : (
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className="max-w-[140px] truncate">{file.name}</span>
      <span className="text-muted-foreground">{formatBytes(file.size)}</span>
      <button
        type="button"
        onClick={onRemove}
        className={cn('rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground')}
        aria-label={`Remove ${file.name}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
