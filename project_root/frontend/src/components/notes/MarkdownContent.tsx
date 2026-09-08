import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

type MarkdownContentProps = {
  content: string
  className?: string
  breaks?: boolean
}

export function MarkdownContent({ content, className, breaks = false }: MarkdownContentProps) {
  if (!content.trim()) {
    return null
  }

  return (
    <div className={cn('markdown-content text-sm text-muted-foreground', className)}>
      <ReactMarkdown remarkPlugins={breaks ? [remarkGfm, remarkBreaks] : [remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
