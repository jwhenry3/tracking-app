import { cn } from '@/lib/utils'

type MaterialTabsProps = {
  tabs: Array<{ id: string; label: string }>
  activeTab: string
  onChange: (tabId: string) => void
  className?: string
}

export function MaterialTabs({ tabs, activeTab, onChange, className }: MaterialTabsProps) {
  return (
    <nav
      className={cn('flex gap-0 overflow-x-auto px-1', className)}
      role="tablist"
      aria-label="Sections"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative shrink-0 px-3 py-2 text-[13px] font-medium transition-colors',
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            <span
              className={cn(
                'absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-opacity',
                active ? 'bg-primary opacity-100' : 'opacity-0',
              )}
            />
          </button>
        )
      })}
    </nav>
  )
}
