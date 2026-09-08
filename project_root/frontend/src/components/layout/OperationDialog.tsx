import { X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type OperationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function OperationDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  bodyClassName,
}: OperationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-2xl', className)}>
        <div className="border-b px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <DialogBody className={cn('flex flex-col p-4 sm:p-6', bodyClassName)}>
          {children}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

type OpsTabsProps = {
  tabs: Array<{ id: string; label: string; icon?: LucideIcon; iconClassName?: string }>
  activeTab: string
  onChange: (tabId: string) => void
}

export function OpsTabs({ tabs, activeTab, onChange }: OpsTabsProps) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition',
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon ? (
              <Icon
                className={cn(
                  'h-3.5 w-3.5',
                  activeTab === tab.id ? 'text-primary-foreground' : tab.iconClassName,
                )}
              />
            ) : null}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
