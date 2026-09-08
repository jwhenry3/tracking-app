import { Banknote, Calendar, CreditCard, Receipt, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type EntryKind = 'event' | 'income' | 'bill' | 'expense'

export const entryTypeMeta: Record<EntryKind, { label: string; icon: LucideIcon; className: string }> = {
  event: { label: 'Event', icon: Calendar, className: 'text-[#2563eb]' },
  income: { label: 'Income', icon: Banknote, className: 'text-[#15803d]' },
  bill: { label: 'Bill', icon: Receipt, className: 'text-[#c2410c]' },
  expense: { label: 'Expense', icon: CreditCard, className: 'text-[#6d28d9]' },
}

export function EntryTypeIcon({
  kind,
  className,
  inheritColor = false,
}: {
  kind: EntryKind
  className?: string
  inheritColor?: boolean
}) {
  const meta = entryTypeMeta[kind]
  const Icon = meta.icon

  return (
    <span className="inline-flex" title={meta.label}>
      <Icon
        className={cn('h-4 w-4 shrink-0', !inheritColor && meta.className, inheritColor && 'text-current', className)}
        aria-label={meta.label}
      />
    </span>
  )
}
