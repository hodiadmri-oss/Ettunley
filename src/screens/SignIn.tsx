import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { GoogleButton } from '@/components/GoogleButton'
import { PasswordInput } from '@/components/PasswordInput'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SignIn() {
  const { error, signInWithEmail, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await signInWithEmail(email, password)
    setBusy(false)
  }

  async function google() {
    setBusy(true)
    await signInWithGoogle()
    setBusy(false)
  }

  return (
    <Screen title="כניסה">
      <GoogleButton label="כניסה עם Google" onClick={google} disabled={busy} />
      <p className="text-center text-ink/60">או עם אימייל</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
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
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        <ErrorNote message={error} />
        <Button type="submit" size="large" disabled={busy}>
          כניסה
        </Button>
      </form>
      <p className="text-center">
        אין לך חשבון עדיין?{' '}
        <Link to="/signup" className="font-medium underline">
          הרשמה
        </Link>
      </p>
    </Screen>
  )
}
