import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import type { Role } from '@/auth/profile'
import { ErrorNote } from '@/components/ErrorNote'
import { GoogleButton } from '@/components/GoogleButton'
import { PasswordInput } from '@/components/PasswordInput'
import { RolePicker } from '@/components/RolePicker'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/strings'

export default function SignUp() {
  const { error, signUpWithEmail, signUpWithGoogle } = useAuth()
  const [role, setRole] = useState<Role | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`הסיסמה צריכה להיות באורך ${MIN_PASSWORD_LENGTH} תווים לפחות.`)
      return
    }
    setLocalError(null)
    setBusy(true)
    await signUpWithEmail(name, email, password)
    setBusy(false)
  }

  async function google() {
    if (!role) return
    setBusy(true)
    await signUpWithGoogle(role)
    setBusy(false)
  }

  return (
    <Screen title="הרשמה" subtitle={role ? undefined : 'מי את/ה?'}>
      <RolePicker value={role} onChange={setRole} />

      {role === 'teacher' && (
        <div className="flex flex-col gap-4">
          <p className="rounded-2xl bg-sky px-4 py-3 text-base">
            מורים נרשמים עם חשבון Google, כדי שהחשבון יהיה מוגן. אחרי ההרשמה החשבון ממתין לאישור.
          </p>
          <ErrorNote message={error} />
          <GoogleButton label="הרשמה עם Google" onClick={google} disabled={busy} />
        </div>
      )}

      {role === 'student' && (
        <div className="flex flex-col gap-4">
          <GoogleButton label="הרשמה עם Google" onClick={google} disabled={busy} />
          <p className="text-center text-ink/60">או עם אימייל</p>
          <form onSubmit={submit} className="flex flex-col gap-4">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">סיסמה</Label>
              <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
              <p className="text-sm text-ink/60">לפחות {MIN_PASSWORD_LENGTH} תווים.</p>
            </div>
            <ErrorNote message={localError ?? error} />
            <Button type="submit" size="large" disabled={busy}>
              יצירת חשבון
            </Button>
          </form>
        </div>
      )}

      <p className="text-center">
        כבר יש לך חשבון?{' '}
        <Link to="/login" className="font-medium underline">
          כניסה
        </Link>
      </p>
    </Screen>
  )
}
