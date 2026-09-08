import { LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type UserMenuProps = {
  username: string | null
  connected: boolean
  onLogout: () => void
}

function userInitials(username: string) {
  return username
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function UserMenu({ username, connected, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  const displayName = username ?? 'User'

  return (
    <div ref={menuRef} className="relative flex justify-center">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        title={displayName}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold transition hover:bg-white/20"
      >
        {userInitials(displayName)}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-full top-0 z-50 ml-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#25282d] text-white shadow-lg"
        >
          <div className="border-b border-white/10 px-3 py-2">
            <p className="truncate text-sm font-medium">{displayName}</p>
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
