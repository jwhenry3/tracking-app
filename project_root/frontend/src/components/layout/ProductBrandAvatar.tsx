import { Link } from 'react-router-dom'

import { APP_LOGO_PATH, APP_NAME, APP_TAGLINE } from '@/lib/branding'
import { cn } from '@/lib/utils'

type ProductBrandAvatarProps = {
  to?: string
  className?: string
  size?: 'sm' | 'md'
  variant?: 'rail' | 'sidebar'
}

export function ProductBrandAvatar({
  to,
  className,
  size = 'md',
  variant = 'rail',
}: ProductBrandAvatarProps) {
  const mark = (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden p-1.5',
        size === 'sm' ? 'h-9 w-9 rounded-xl' : 'h-11 w-11 rounded-2xl',
        variant === 'rail' ? 'bg-white/10' : 'bg-muted',
        className,
      )}
      title={`${APP_NAME} — ${APP_TAGLINE}`}
    >
      <img src={APP_LOGO_PATH} alt="" className="h-full w-full object-contain" aria-hidden="true" />
    </span>
  )

  if (!to) {
    return mark
  }

  return (
    <Link to={to} aria-label={APP_NAME} className="transition hover:opacity-90">
      {mark}
    </Link>
  )
}
