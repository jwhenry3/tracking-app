import { OperationDialog } from '@/components/layout/OperationDialog'
import { UserProfileSettings } from '@/components/profile/UserProfileSettings'
import { getUserDisplayName } from '@/lib/userProfile'
import { useAuthStore } from '@/stores/authStore'

type UserProfilePanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserProfilePanel({ open, onOpenChange }: UserProfilePanelProps) {
  const username = useAuthStore((s) => s.username)
  const displayName = useAuthStore((s) => s.displayName)

  const title = getUserDisplayName({ display_name: displayName, username })

  return (
    <OperationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Account settings"
      description={`Manage profile details for ${title}.`}
    >
      <UserProfileSettings />
    </OperationDialog>
  )
}
