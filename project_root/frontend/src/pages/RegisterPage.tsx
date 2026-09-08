import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'

export function RegisterPage() {
  const navigate = useNavigate()
  const register = useAuthStore((state) => state.register)
  const isLoading = useAuthStore((state) => state.isLoading)
  const error = useAuthStore((state) => state.error)
  const clearError = useAuthStore((state) => state.clearError)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [createWorkspace, setCreateWorkspace] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    clearError()

    try {
      const trimmedWorkspace = workspaceName.trim()
      await register(
        username,
        password,
        createWorkspace && trimmedWorkspace ? trimmedWorkspace : undefined,
        email.trim() || undefined,
      )
      const { activeWorkspaceId, workspaces } = useAuthStore.getState()
      const workspaceId = activeWorkspaceId ?? workspaces[0]?.id
      navigate(workspaceId ? `/w/${workspaceId}/calendar` : '/', { replace: true })
    } catch {
      // handled in store
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Sign up to join an existing workspace or create your own later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                minLength={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="Optional — for password recovery"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <label className="flex items-start gap-3 rounded-lg border px-3 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={createWorkspace}
                onChange={(event) => setCreateWorkspace(event.target.checked)}
              />
              <span>
                <span className="block font-medium">Create a workspace now</span>
                <span className="mt-1 block text-muted-foreground">
                  Leave unchecked if you plan to join someone else&apos;s workspace.
                </span>
              </span>
            </label>
            {createWorkspace ? (
              <div className="space-y-2">
                <Label htmlFor="workspace">Workspace name</Label>
                <Input
                  id="workspace"
                  placeholder="Smith Family"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  required={createWorkspace}
                />
              </div>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={isLoading}>
              {isLoading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link className="text-foreground underline underline-offset-4" to="/login">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
