import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { giveCopyrightStatement } from '@/auth/profile'
import { ErrorNote } from '@/components/ErrorNote'
import { InviteCodeCard } from '@/components/InviteCodeCard'
import { Screen } from '@/components/Screen'
import { StudentsList } from '@/components/StudentsList'
import { Button } from '@/components/ui/button'
import { EnterCode, WaitingForTeacher } from '@/screens/JoinTeacher'

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

// A confirmed student. Minors see whether the parent has approved recording yet.
function StudentHome() {
  const { state, reloadProfile } = useAuth()

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reloadProfile()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reloadProfile])

  if (state.status !== 'ready') return null
  const { profile } = state
  return (
    <>
      <p className="rounded-2xl bg-sage px-4 py-4 text-center text-lg">
        ברוכים הבאים! המורה שלך: {profile.teacherName}
      </p>
      {profile.isMinor && !profile.consentAt && (
        <p className="rounded-2xl bg-sky px-4 py-4 text-center text-base">
          ההקלטות ייפתחו אחרי שההורה יאשר במייל
        </p>
      )}
      {profile.isMinor && profile.consentAt && (
        <p className="rounded-2xl bg-sky px-4 py-4 text-center text-base">✓ ההורה אישר. אפשר להקליט</p>
      )}
    </>
  )
}

// Placeholder until the real home screens exist (phase 1, step 9).
export default function Home() {
  const { state, signOut } = useAuth()
  if (state.status !== 'ready') return null
  const { profile, isAdmin } = state

  // A student without a confirmed teacher cannot do anything else yet.
  if (profile.role === 'student') {
    if (!profile.teacherId) return <EnterCode />
    if (profile.linkStatus !== 'approved') return <WaitingForTeacher teacherName={profile.teacherName ?? ''} />
  }

  const pendingTeacher = profile.role === 'teacher' && profile.teacherStatus !== 'approved'

  return (
    <Screen title={`שלום, ${profile.name}`}>
      {pendingTeacher ? (
        <PendingTeacher />
      ) : profile.role === 'teacher' ? (
        <>
          <p className="rounded-2xl bg-sage px-4 py-4 text-center text-lg">ברוכה הבאה, מורה!</p>
          {profile.inviteCode && <InviteCodeCard code={profile.inviteCode} />}
          <StudentsList />
        </>
      ) : (
        <StudentHome />
      )}
      {isAdmin && (
        <Button asChild variant="soft">
          <Link to="/admin">ניהול</Link>
        </Button>
      )}
      <Button variant="outline" onClick={() => void signOut()}>
        יציאה
      </Button>
    </Screen>
  )
}
