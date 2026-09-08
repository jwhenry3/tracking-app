import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { THEME_OPTIONS } from '@/lib/themes'
import { useThemeStore } from '@/stores/themeStore'

function ThemeSwatch({ colors }: { colors: [string, string] }) {
  return (
    <span className="flex h-5 w-5 shrink-0 overflow-hidden rounded-full border border-white/15">
      <span className="h-full w-1/2" style={{ backgroundColor: colors[0] }} />
      <span className="h-full w-1/2" style={{ backgroundColor: colors[1] }} />
    </span>
  )
}

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const selected = THEME_OPTIONS.find((option) => option.id === theme) ?? THEME_OPTIONS[0]

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape, true)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative border-b border-white/10 px-3 py-3">
      <label id="theme-select-label" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/60">
        Theme
      </label>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="theme-select-label"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
      >
        <ThemeSwatch colors={selected.swatch} />
        <span className="min-w-0 flex-1 truncate text-left">{selected.label}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-white/70 transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-labelledby="theme-select-label"
          className="absolute left-3 right-3 top-full z-20 mt-1 overflow-hidden rounded-lg border border-white/15 bg-[#25282d] py-1 shadow-lg"
        >
          {THEME_OPTIONS.map((option) => {
            const active = theme === option.id

            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  title={option.description}
                  onClick={() => {
                    setTheme(option.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition',
                    active ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10',
                  )}
                >
                  <ThemeSwatch colors={option.swatch} />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
