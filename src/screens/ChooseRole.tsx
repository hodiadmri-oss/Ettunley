import { useState } from 'react'
import type { FormEvent } from 'react'
import { isGoogleUser, useAuth } from '@/auth/AuthProvider'
import type { Role } from '@/auth/profile'
import { ErrorNote } from '@/components/ErrorNote'
import { RolePicker } from '@/components/RolePicker'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_NAME_LENGTH } from '@/lib/strings'

// Shown when someone signed in (for example with Google) but has no profile yet.
export default function ChooseRole() {
  const { state, error, completeProfile, signOut } = useAuth()
  const user = state.status === 'needsProfile' ? state.user : null
  const [role, setRole] = useState<Role | null>(null)
  const [name, setName] = useState(user?.displayName ?? '')
  const [busy, setBusy] = useState(false)

  if (!user) return null
  const teacherAllowed = isGoogleUser(user)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!role) return
    setBusy(true)
    await completeProfile(role, name)
    setBusy(false)
  }

  return (
    <Screen title="עוד רגע וסיימנו" subtitle="מי את/ה?">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <RolePicker value={role} onChange={setRole} teacherAllowed={teacherAllowed} />
        {!teacherAllowed && (
          <p className="text-center text-sm text-ink/70">מורים נרשמים עם חשבון Google בלבד.</p>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">שם</Label>
          <Input
            id="name"
            autoComplete="name"
            required
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <ErrorNote message={error} />
        <Button type="submit" size="large" disabled={!role || busy}>
          המשך
        </Button>
      </form>
      <Button type="button" variant="outline" onClick={() => void signOut()}>
        יציאה
      </Button>
    </Screen>
  )
}
