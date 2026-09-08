import type { LucideIcon } from 'lucide-react'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ManageTable({
  children,
  className,
  tableClassName,
}: {
  children: ReactNode
  className?: string
  tableClassName?: string
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className={cn('w-full border-collapse text-sm', tableClassName ?? 'min-w-[720px]')}>
        {children}
      </table>
    </div>
  )
}

export function ManageTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {children}
      </tr>
    </thead>
  )
}

export function ManageTableTh({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  return <th className={cn('px-3 py-2 font-medium', className)}>{children}</th>
}

export function ManageTableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y">{children}</tbody>
}

export function ManageTableRow({ children }: { children: ReactNode }) {
  return <tr className="transition hover:bg-muted/20">{children}</tr>
}

export function ManageTableTd({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  return <td className={cn('px-3 py-2.5 align-middle', className)}>{children}</td>
}

export function ManageIconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}

export function ManageAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <ManageIconButton icon={Plus} label={label} onClick={onClick} />
}
