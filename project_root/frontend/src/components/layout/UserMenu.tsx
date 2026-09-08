import { LogOut, Settings } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { ThemeSwitcher } from '@/components/layout/ThemeSwitcher'
import { UserAvatar } from '@/components/profile/UserAvatar'
import { getUserDisplayName } from '@/lib/userProfile'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

type UserMenuProps = {
  connected: boolean
  onOpenSettings: () => void
  onLogout: () => void
  variant?: 'rail' | 'header'
}

export function UserMenu({ connected, onOpenSettings, onLogout, variant = 'rail' }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const token = useAuthStore((s) => s.token)
  const username = useAuthStore((s) => s.username)
  const displayName = useAuthStore((s) => s.displayName)
  const avatarUrl = useAuthStore((s) => s.avatarUrl)
  const avatarVersion = useAuthStore((s) => s.avatarVersion)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const resolvedDisplayName = getUserDisplayName({ display_name: displayName, username })

  const isHeader = variant === 'header'

  return (
    <div
      ref={menuRef}
      className={cn('relative w-full', isHeader ? 'flex justify-start' : 'flex justify-center')}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        title={resolvedDisplayName}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-sm transition',
          isHeader ? 'bg-muted hover:bg-muted/80' : 'bg-white/10 hover:bg-white/20',
        )}
      >
        <UserAvatar
          token={token}
          hasAvatar={Boolean(avatarUrl)}
          displayName={resolvedDisplayName}
          avatarVersion={avatarVersion}
          className="h-11 w-11 text-sm"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-[min(18rem,calc(100vw-1rem))] rounded-xl border border-white/10 bg-[#25282d] text-white shadow-lg"
        >
          <div className="border-b border-white/10 px-3 py-2">
            <p className="truncate text-sm font-medium">{resolvedDisplayName}</p>
            {username && resolvedDisplayName !== username ? (
              <p className="truncate text-xs text-white/60">@{username}</p>
            ) : null}
            <p className="text-xs text-white/60">
              {connected ? 'Live sync connected' : 'Live sync disconnected'}
            </p>
          </div>

          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm transition hover:bg-white/10"
            onClick={() => {
              setOpen(false)
              onOpenSettings()
            }}
          >
            <Settings className="h-4 w-4" />
            Account settings
          </button>

          <ThemeSwitcher />

          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm transition hover:bg-white/10"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  )
}
