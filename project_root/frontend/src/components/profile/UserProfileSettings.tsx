import { useEffect, useRef, useState } from 'react'

import { UserAvatar } from '@/components/profile/UserAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteAvatar, updateProfileSettings, uploadAvatar } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'
import {
  invalidateUserProfileQueries,
  syncLocalUserProfile,
} from '@/lib/queries/userProfileSync'
import { getUserDisplayName } from '@/lib/userProfile'
import { useAuthStore } from '@/stores/authStore'

export function UserProfileSettings() {
  const token = useAuthStore((s) => s.token)
  const username = useAuthStore((s) => s.username)
  const email = useAuthStore((s) => s.email)
  const displayName = useAuthStore((s) => s.displayName)
  const avatarUrl = useAuthStore((s) => s.avatarUrl)
  const avatarVersion = useAuthStore((s) => s.avatarVersion)
  const applyUser = useAuthStore((s) => s.applyUser)
  const workspaces = useAuthStore((s) => s.workspaces)

  const [name, setName] = useState(displayName ?? '')
  const [usernameValue, setUsernameValue] = useState(username ?? '')
  const [emailValue, setEmailValue] = useState(email ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(displayName ?? '')
  }, [displayName])

  useEffect(() => {
    setUsernameValue(username ?? '')
  }, [username])

  useEffect(() => {
    setEmailValue(email ?? '')
  }, [email])

  const previewName = getUserDisplayName({ display_name: name, username: usernameValue })

  async function handleSave() {
    if (!token) return

    const nextUsername = usernameValue.trim()
    if (nextUsername.length < 3 || nextUsername.length > 50) {
      setFeedback('Username must be between 3 and 50 characters.')
      return
    }

    setSaving(true)
    setFeedback(null)
    try {
      const trimmed = name.trim()
      const previousUsername = username ?? ''
      const user = await updateProfileSettings(token, {
        username: nextUsername,
        email: emailValue.trim() || null,
        display_name: trimmed || null,
      })
      applyUser(user)

      const workspaceIds = workspaces.map((workspace) => workspace.id)
      if (user.username !== previousUsername) {
        await Promise.all(workspaceIds.map((workspaceId) => invalidateUserProfileQueries(queryClient, workspaceId)))
      } else {
        syncLocalUserProfile(user, workspaceIds)
      }

      setFeedback('Profile saved.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!token || !file) return

    setAvatarLoading(true)
    setFeedback(null)
    try {
      const user = await uploadAvatar(token, file)
      applyUser(user)
      setFeedback('Avatar updated.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not upload avatar')
    } finally {
      setAvatarLoading(false)
    }
  }

  async function handleRemoveAvatar() {
    if (!token || !avatarUrl) return

    setAvatarLoading(true)
    setFeedback(null)
    try {
      const user = await deleteAvatar(token)
      applyUser(user)
      setFeedback('Avatar removed.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not remove avatar')
    } finally {
      setAvatarLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Profile</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Set how your name and avatar appear across workspaces.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <UserAvatar
            token={token}
            hasAvatar={Boolean(avatarUrl)}
            displayName={previewName}
            avatarVersion={avatarVersion}
            className="h-16 w-16 bg-muted text-lg"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={avatarLoading}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarLoading ? 'Uploading…' : 'Upload avatar'}
            </Button>
            {avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={avatarLoading}
                onClick={() => void handleRemoveAvatar()}
              >
                Remove
              </Button>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(event) => void handleAvatarChange(event)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-display-name">Display name</Label>
          <Input
            id="profile-display-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={usernameValue || 'Display name'}
            maxLength={100}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-username">Username</Label>
          <Input
            id="profile-username"
            value={usernameValue}
            onChange={(event) => setUsernameValue(event.target.value)}
            autoComplete="username"
            minLength={3}
            maxLength={50}
            required
          />
          <p className="text-xs text-muted-foreground">Used to sign in. 3–50 characters.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            type="email"
            value={emailValue}
            onChange={(event) => setEmailValue(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
          />
          <p className="text-xs text-muted-foreground">
            Optional. Used for password recovery and as an alternate sign-in.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
          {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
        </div>
      </section>
    </div>
  )
}
