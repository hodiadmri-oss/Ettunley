import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { joinErrorMessage, joinTeacher } from '@/lib/linkApi'

// A student without a teacher types the teacher's code. That only sends a request;
// the teacher has to confirm it.
export function EnterCode() {
  const { reloadProfile, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await joinTeacher(code)
      await reloadProfile()
    } catch (err) {
      setError(joinErrorMessage((err as { code?: string }).code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="הצטרפות למורה" subtitle="המורה שלך נתנה לך קוד בן 6 תווים">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">קוד המורה</Label>
          <Input
            id="code"
            dir="ltr"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={9}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="text-center text-2xl tracking-widest"
          />
        </div>
        <ErrorNote message={error} />
        <Button type="submit" size="large" disabled={busy || code.replace(/\s/g, '').length < 6}>
          הצטרפות
        </Button>
      </form>
      <Button type="button" variant="outline" onClick={() => void signOut()}>
        יציאה
      </Button>
    </Screen>
  )
}

// The request was sent; waiting for the teacher.
export function WaitingForTeacher({ teacherName }: { teacherName: string }) {
  const { reloadProfile, signOut } = useAuth()

  // Look again when the student comes back to the tab, so the approval shows up.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reloadProfile()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reloadProfile])

  return (
    <Screen title="ממתינים לאישור המורה" subtitle={teacherName}>
      <p className="rounded-2xl bg-sage px-4 py-4 text-center text-lg">
        שלחנו בקשה. ברגע שהמורה תאשר, אפשר להתחיל.
      </p>
      <Button type="button" variant="soft" onClick={() => void reloadProfile()}>
        בדיקה מחדש
      </Button>
      <Button type="button" variant="outline" onClick={() => void signOut()}>
        יציאה
      </Button>
    </Screen>
  )
}
