import { APP_NAME, APP_TAGLINE } from '@/lib/branding'

export function AuthBrandHeader() {
  return (
    <div className="max-w-md text-center">
      <p className="text-2xl font-bold tracking-tight text-foreground">{APP_NAME}</p>
      <p className="mt-1 text-sm text-muted-foreground">{APP_TAGLINE}</p>
    </div>
  )
}
