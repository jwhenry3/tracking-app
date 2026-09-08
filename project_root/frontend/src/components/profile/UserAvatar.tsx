import { useEffect, useState } from 'react'

import { fetchAvatarBlob } from '@/lib/api'
import { userInitials } from '@/lib/userProfile'
import { cn } from '@/lib/utils'

type UserAvatarProps = {
  token: string | null
  hasAvatar: boolean
  displayName: string
  avatarVersion: number
  className?: string
}

export function UserAvatar({
  token,
  hasAvatar,
  displayName,
  avatarVersion,
  className,
}: UserAvatarProps) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !hasAvatar) {
      setSrc(null)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    void fetchAvatarBlob(token)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [token, hasAvatar, avatarVersion])

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn('rounded-2xl object-cover', className)}
      />
    )
  }

  return (
    <span className={cn('flex items-center justify-center font-semibold', className)}>
      {userInitials(displayName)}
    </span>
  )
}
