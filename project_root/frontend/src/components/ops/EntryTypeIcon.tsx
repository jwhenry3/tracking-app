import { Banknote, Calendar, CreditCard, Receipt, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type EntryKind = 'event' | 'income' | 'bill' | 'expense'

export const entryTypeColors: Record<EntryKind, string> = {
  event: '#2563eb',
  income: '#15803d',
  bill: '#dc2626',
  expense: '#64748b',
}

export const entryTypeMeta: Record<
  EntryKind,
  { label: string; icon: LucideIcon; className: string; badgeClassName: string }
> = {
  event: {
    label: 'Event',
    icon: Calendar,
    className: 'text-[#2563eb]',
    badgeClassName: 'bg-[#2563eb]/10 text-[#2563eb]',
  },
  income: {
    label: 'Income',
    icon: Banknote,
    className: 'text-[#15803d]',
    badgeClassName: 'bg-[#15803d]/10 text-[#15803d]',
  },
  bill: {
    label: 'Bill',
    icon: Receipt,
    className: 'text-[#dc2626]',
    badgeClassName: 'bg-[#dc2626]/10 text-[#dc2626]',
  },
  expense: {
    label: 'Expense',
    icon: CreditCard,
    className: 'text-[#64748b]',
    badgeClassName: 'bg-[#64748b]/15 text-[#64748b]',
  },
}

export function EntryTypeIcon({
  kind,
  className,
  variant = 'plain',
  inheritColor = false,
}: {
  kind: EntryKind
  className?: string
  variant?: 'plain' | 'badge'
  inheritColor?: boolean
}) {
  const meta = entryTypeMeta[kind]
  const Icon = meta.icon

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        variant === 'badge' && 'h-7 w-7 rounded-md',
        variant === 'badge' && meta.badgeClassName,
      )}
      title={meta.label}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          variant === 'badge' && 'h-3.5 w-3.5',
          !inheritColor && meta.className,
          inheritColor && 'text-current',
          className,
        )}
        aria-label={meta.label}
      />
    </span>
  )
}

export function EntryTypeTitle({
  kind,
  title,
  suffix,
  className,
}: {
  kind: EntryKind
  title: string
  suffix?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <EntryTypeIcon kind={kind} variant="badge" />
      <span className="truncate font-medium">{title}</span>
      {suffix}
    </div>
  )
}
