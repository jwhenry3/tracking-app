import { Link } from 'react-router-dom'

import { ProductBrandAvatar } from '@/components/layout/ProductBrandAvatar'
import { APP_NAME } from '@/lib/branding'
import { cn } from '@/lib/utils'

type ProductBrandHeaderProps = {
  to?: string
  className?: string
}

export function ProductBrandHeader({ to, className }: ProductBrandHeaderProps) {
  const content = (
    <>
      <ProductBrandAvatar size="sm" variant="sidebar" />
      <span className="truncate text-base font-semibold">{APP_NAME}</span>
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        className={cn('flex min-w-0 items-center gap-2.5 transition hover:opacity-90', className)}
      >
        {content}
      </Link>
    )
  }

  return <div className={cn('flex min-w-0 items-center gap-2.5', className)}>{content}</div>
}
