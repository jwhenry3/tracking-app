export function userInitials(name: string) {
  return name
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function getUserDisplayName(user: {
  display_name?: string | null
  username?: string | null
}) {
  const displayName = user.display_name?.trim()
  if (displayName) return displayName
  if (user.username?.trim()) return user.username.trim()
  return 'User'
}
