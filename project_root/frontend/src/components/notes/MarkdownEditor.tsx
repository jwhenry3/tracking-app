import {
  Bold,
  Code,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Paperclip,
} from 'lucide-react'
import {
  type ClipboardEventHandler,
  type DragEvent,
  type KeyboardEventHandler,
  type ReactNode,
  useRef,
  useState,
} from 'react'

import { FormField } from '@/components/forms/FormField'
import { MarkdownContent } from '@/components/notes/MarkdownContent'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { dataTransferHasFiles, filesFromList } from '@/lib/files'
import { insertMarkdown, insertSnippet, prefixLines } from '@/lib/markdown'
import { cn } from '@/lib/utils'

type MarkdownEditorMode = 'preview' | 'source'

type MarkdownEditorProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>
  onFiles?: (files: File[]) => void
  placeholder?: string
  rows?: number
  className?: string
  compact?: boolean
  disabled?: boolean
  defaultMode?: MarkdownEditorMode
}

export function MarkdownEditor({
  id,
  value,
  onChange,
  onBlur,
  onKeyDown,
  onPaste,
  onFiles,
  placeholder = 'Write notes in markdown…',
  rows,
  className,
  compact = false,
  disabled = false,
  defaultMode = 'source',
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCountRef = useRef(0)
  const [mode, setMode] = useState<MarkdownEditorMode>(defaultMode)
  const [dragOver, setDragOver] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const linkRangeRef = useRef({ start: 0, end: 0 })
  const editorRows = rows ?? (compact ? 2 : 6)
  const minHeightClass = compact ? 'min-h-[72px]' : 'min-h-[120px]'
  const canAttach = Boolean(onFiles) && !disabled

  function applyInsert(before: string, after = before) {
    const textarea = textareaRef.current
    if (!textarea || disabled) return
    textarea.focus()
    insertMarkdown(textarea, value, before, after, onChange)
  }

  function applyPrefix(prefix: string) {
    const textarea = textareaRef.current
    if (!textarea || disabled) return
    textarea.focus()
    prefixLines(textarea, value, prefix, onChange)
  }

  function openLinkDialog() {
    if (disabled) return
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? value.length
    const end = textarea?.selectionEnd ?? value.length
    const selected = value.slice(start, end).trim()
    linkRangeRef.current = { start, end }
    if (looksLikeUrl(selected)) {
      setLinkName('')
      setLinkUrl(selected)
    } else {
      setLinkName(selected)
      setLinkUrl('')
    }
    setLinkOpen(true)
  }

  function applyLink() {
    const url = normalizeLinkUrl(linkUrl)
    if (!url) return
    const name = linkName.trim() || url
    const textarea = textareaRef.current
    if (!textarea) return
    insertSnippet(textarea, value, `[${name}](${url})`, onChange, linkRangeRef.current)
    setLinkOpen(false)
  }

  function addIncomingFiles(files: File[]) {
    if (!onFiles || files.length === 0) return
    onFiles(files)
  }

  function handlePaste(event: Parameters<ClipboardEventHandler<HTMLTextAreaElement>>[0]) {
    const files = filesFromList(event.clipboardData.files)
    if (onFiles && files.length > 0) {
      event.preventDefault()
      addIncomingFiles(files)
      return
    }
    onPaste?.(event)
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!canAttach || !dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
    dragCountRef.current += 1
    setDragOver(true)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!canAttach || !dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!canAttach) return
    event.preventDefault()
    dragCountRef.current = Math.max(0, dragCountRef.current - 1)
    if (dragCountRef.current === 0) setDragOver(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!canAttach) return
    event.preventDefault()
    event.stopPropagation()
    dragCountRef.current = 0
    setDragOver(false)
    addIncomingFiles(filesFromList(event.dataTransfer.files))
  }

  function syncPreviewScroll() {
    const textarea = textareaRef.current
    const preview = previewScrollRef.current
    if (!textarea || !preview) return
    preview.scrollTop = textarea.scrollTop
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border bg-background',
        dragOver && 'border-primary',
        className,
      )}
      onDragEnter={handleDragEnter}
      onDragOverCapture={handleDragOver}
      onDragLeave={handleDragLeave}
      onDropCapture={handleDrop}
    >
      {mode === 'source' ? (
        <Textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={editorRows}
          disabled={disabled}
          aria-label={placeholder}
          className={cn(
            'resize-y rounded-none border-0 bg-transparent focus-visible:ring-0',
            minHeightClass,
          )}
        />
      ) : (
        <div className={cn('relative', minHeightClass)}>
          <div
            ref={previewScrollRef}
            className={cn('pointer-events-none absolute inset-0 overflow-hidden px-3 py-2', minHeightClass)}
          >
            {value.trim() ? (
              <MarkdownContent
                content={value}
                breaks={compact}
                className={compact ? 'text-foreground' : undefined}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{placeholder}</p>
            )}
          </div>
          <Textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            onScroll={syncPreviewScroll}
            placeholder=""
            rows={editorRows}
            disabled={disabled}
            spellCheck={false}
            aria-label={placeholder}
            className={cn(
              'relative z-10 resize-y rounded-none border-0 bg-transparent text-transparent caret-foreground selection:bg-primary/30 focus-visible:ring-0',
              minHeightClass,
            )}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-0.5 border-t bg-muted/30 px-1.5 py-1">
        <ToolbarButton label="Bold" disabled={disabled} onClick={() => applyInsert('**', '**')}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Italic" disabled={disabled} onClick={() => applyInsert('*', '*')}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Link" disabled={disabled} onClick={openLinkDialog}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Heading" disabled={disabled} onClick={() => applyPrefix('## ')}>
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Bullet list" disabled={disabled} onClick={() => applyPrefix('- ')}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" disabled={disabled} onClick={() => applyPrefix('1. ')}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        {onFiles ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                addIncomingFiles(filesFromList(event.target.files))
                event.target.value = ''
              }}
            />
            <ToolbarButton
              label="Attach"
              disabled={!canAttach}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </ToolbarButton>
          </>
        ) : null}
        <div className="mx-0.5 h-4 w-px bg-border" />
        <ToolbarButton
          label="Preview"
          active={mode === 'preview'}
          disabled={disabled}
          onClick={() => setMode('preview')}
        >
          <Eye className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Source"
          active={mode === 'source'}
          disabled={disabled}
          onClick={() => {
            setMode('source')
            window.requestAnimationFrame(() => textareaRef.current?.focus())
          }}
        >
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10">
          <p className="text-sm font-medium">Drop files to attach</p>
        </div>
      ) : null}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-md">
          <DialogBody className="p-6">
          <div
            className="space-y-4"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.stopPropagation()
                applyLink()
              }
            }}
          >
            <div>
              <h3 className="text-lg font-semibold">Insert link</h3>
              <p className="mt-1 text-sm text-muted-foreground">Add a name and URL to insert a markdown link.</p>
            </div>
            <FormField
              id="markdown-link-name"
              label="Name"
              value={linkName}
              placeholder="Display text"
              onChange={setLinkName}
            />
            <FormField
              id="markdown-link-url"
              label="URL"
              value={linkUrl}
              placeholder="https://example.com"
              onChange={setLinkUrl}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!linkUrl.trim()} onClick={applyLink}>
                Insert
              </Button>
            </div>
          </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
        active && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function looksLikeUrl(value: string) {
  return /^(https?:\/\/|www\.|mailto:)/i.test(value.trim())
}

function normalizeLinkUrl(value: string) {
  const url = value.trim()
  if (!url) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('#') || url.startsWith('mailto:')) {
    return url
  }
  return `https://${url}`
}
