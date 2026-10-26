import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { giveCopyrightStatement } from '@/auth/profile'
import { ErrorNote } from '@/components/ErrorNote'
import { HomeFooter } from '@/components/HomeFooter'
import { InviteCodeCard } from '@/components/InviteCodeCard'
import { Screen } from '@/components/Screen'
import { StudentsList } from '@/components/StudentsList'
import { Button } from '@/components/ui/button'

const COPYRIGHT_STATEMENT = 'אני מצהיר/ת שיש לי זכות להשתמש בחומרים שאעלה, ואני אחראי/ת לתוכן שלהם'

// A teacher waiting for approval sees only this. The statement is needed before
// the owner can approve; it is stored once with the time.
function PendingTeacher() {
  const { state, reloadProfile } = useAuth()
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check again when the person comes back to the tab, so approval shows up.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reloadProfile()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reloadProfile])

  if (state.status !== 'ready') return null
  const { user, profile } = state

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await giveCopyrightStatement(user.uid)
      await reloadProfile()
    } catch {
      setError('לא הצלחנו לשמור. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="rounded-2xl bg-sage px-4 py-4 text-center text-lg">
        החשבון שלך ממתין לאישור. נעדכן אותך כשהוא יאושר.
      </p>
      {!profile.copyrightStatementAt && (
        <div className="flex flex-col gap-4 rounded-2xl bg-white px-4 py-4">
          <p className="text-base">כדי שנוכל לאשר את החשבון, צריך לאשר את ההצהרה הבאה:</p>
          <label className="flex items-start gap-3 text-base">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 size-6 shrink-0 accent-ink"
            />
            <span>{COPYRIGHT_STATEMENT}</span>
          </label>
          <ErrorNote message={error} />
          <Button disabled={!agreed || busy} onClick={() => void send()}>
            שליחה
          </Button>
        </div>
      )}
    </>
  )
}

// The teacher's home: the students first (tap one to see their assignments), and the
// invite code, which is needed only when a new student joins, in one small line.
export default function TeacherHome() {
  const { state } = useAuth()
  if (state.status !== 'ready') return null
  const { profile } = state
  const pending = profile.teacherStatus !== 'approved'

  return (
    <Screen title={`שלום, ${profile.name}`} top>
      {pending ? (
        <PendingTeacher />
      ) : (
        <>
          <StudentsList />
          {profile.inviteCode && <InviteCodeCard code={profile.inviteCode} />}
        </>
      )}
      <HomeFooter />
    </Screen>
  )
}
