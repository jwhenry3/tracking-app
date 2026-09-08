import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  icon?: LucideIcon
  title: string
  subtitle?: string
  children?: ReactNode
  className?: string
}

export function PageHeader({ icon: Icon, title, subtitle, children, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-bold leading-tight">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-0.5">
          {children}
        </div>
      ) : null}
    </header>
  )
}

type PageHeaderIconButtonProps = {
  icon: LucideIcon
  label: string
  onClick?: () => void
  disabled?: boolean
}

export function PageHeaderIconButton({ icon: Icon, label, onClick, disabled }: PageHeaderIconButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}

export function PageHeaderTextButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </Button>
  )
}

export function PageHeaderDivider() {
  return <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
}
