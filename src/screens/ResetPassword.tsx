import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ResetPassword() {
  const { error, sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setSent(await sendPasswordReset(email))
    setBusy(false)
  }

  return (
    <Screen title="איפוס סיסמה" subtitle="נשלח אליך מייל עם קישור לבחירת סיסמה חדשה">
      {sent ? (
        <p role="status" className="rounded-2xl bg-sage px-4 py-4 text-center text-lg">
          אם יש חשבון עם האימייל הזה, נשלח אליו מייל. כדאי לבדוק גם בתיקיית הספאם.
        </p>
      ) : (
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
          <ErrorNote message={error} />
          <Button type="submit" size="large" disabled={busy}>
            שליחת קישור
          </Button>
        </form>
      )}
      <p className="text-center">
        <Link to="/login" className="font-medium underline">
          חזרה לכניסה
        </Link>
      </p>
    </Screen>
  )
}
