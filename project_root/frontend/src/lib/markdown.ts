import type { RefObject } from 'react'

export function insertSnippet(
  textarea: HTMLTextAreaElement,
  value: string,
  snippet: string,
  onChange: (next: string) => void,
  range?: { start: number; end: number },
) {
  const start = range?.start ?? textarea.selectionStart
  const end = range?.end ?? textarea.selectionEnd
  const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`
  onChange(next)

  window.requestAnimationFrame(() => {
    textarea.focus()
    const cursor = start + snippet.length
    textarea.setSelectionRange(cursor, cursor)
  })
}

export function insertMarkdown(
  textarea: HTMLTextAreaElement,
  value: string,
  before: string,
  after: string,
  onChange: (next: string) => void,
) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = value.slice(start, end)
  const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`
  onChange(next)

  window.requestAnimationFrame(() => {
    textarea.focus()
    const cursor = start + before.length + selected.length
    textarea.setSelectionRange(cursor, cursor)
  })
}

export function prefixLines(
  textarea: HTMLTextAreaElement,
  value: string,
  prefix: string,
  onChange: (next: string) => void,
) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const blockStart = value.lastIndexOf('\n', start - 1) + 1
  const blockEnd = value.indexOf('\n', end)
  const rangeEnd = blockEnd === -1 ? value.length : blockEnd
  const block = value.slice(blockStart, rangeEnd)
  const nextBlock = block
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join('\n')
  const next = `${value.slice(0, blockStart)}${nextBlock}${value.slice(rangeEnd)}`
  onChange(next)
  textarea.focus()
}

export function focusTextarea(ref: RefObject<HTMLTextAreaElement | null>) {
  ref.current?.focus()
}
