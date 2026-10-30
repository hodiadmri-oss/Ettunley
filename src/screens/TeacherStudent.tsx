import { doc, getDoc } from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import type { Profile } from '@/auth/profile'
import { AssignmentList } from '@/components/AssignmentList'
import { ConsentRequest } from '@/components/ConsentRequest'
import { ErrorNote } from '@/components/ErrorNote'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { calendarAge } from '@/lib/age'
import { listAssignments, type Assignment } from '@/lib/assignments'
import { formatClock } from '@/lib/practiceTimer'
import { summarizePractice } from '@/lib/practiceSummary'
import { loadOverview, type AssignmentInfo } from '@/lib/studentOverview'
import { db } from '@/lib/firebase'
import { removeStudent } from '@/lib/linkApi'

// Today's practice, this week's practice and the streak, from the per-day totals on the profile.
export function PracticeLine({ days }: { days: Record<string, number> | undefined }) {
  const summary = summarizePractice(days)
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-3 text-center text-base shadow-sm" data-testid="practice-line">
      <span>
        היום <bdi className="font-bold tabular-nums">{formatClock(summary.todaySeconds * 1000)}</bdi>
      </span>
      <span>
        השבוע <bdi className="font-bold tabular-nums">{formatClock(summary.weekSeconds * 1000)}</bdi>
      </span>
      <span>
        רצף <bdi className="font-bold">{summary.streak}</bdi> {summary.streak === 1 ? 'יום' : 'ימים'}
      </span>
    </p>
  )
}

// One student, from the teacher's side: details, parent consent for minors, the
// assignments and a button for a new one. (Progress arrives in a later phase.)
export default function TeacherStudent() {
  const { studentId = '' } = useParams()
  const { state } = useAuth()
  const navigate = useNavigate()
  const teacherUid = state.status === 'ready' ? state.user.uid : null
  const [student, setStudent] = useState<Profile | null | 'missing'>(null)
  const [assignments, setAssignments] = useState<Assignment[] | null>(null)
  const [info, setInfo] = useState<Record<string, AssignmentInfo>>({})
  const [error, setError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!teacherUid) return
    setError(null)
    try {
      const snap = await getDoc(doc(db, 'users', studentId))
      const profile = snap.exists() ? (snap.data() as Profile) : null
      if (!profile || profile.teacherId !== teacherUid) return setStudent('missing')
      setStudent(profile)
      if (profile.linkStatus === 'approved') {
        const list = await listAssignments(studentId, teacherUid)
        setAssignments(list)
        setInfo(await loadOverview(studentId, list, teacherUid))
      }
    } catch {
      // A student who is no longer linked cannot be read any more.
      setStudent('missing')
    }
  }, [studentId, teacherUid])

  useEffect(() => {
    void load()
  }, [load])

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await removeStudent(studentId)
      navigate('/teacher', { replace: true })
    } catch {
      setError('ההסרה לא הצליחה. אפשר לנסות שוב.')
      setBusy(false)
    }
  }

  if (student === null) {
    return (
      <Screen title="רגע..." top backTo="/teacher">
        <p className="text-center text-ink/60">טוענים</p>
      </Screen>
    )
  }
  if (student === 'missing') {
    return (
      <Screen title="התלמיד/ה לא נמצא/ה" top backTo="/teacher">
        <p className="text-center text-ink/70">אולי הוסרו מהרשימה.</p>
      </Screen>
    )
  }

  const age = student.birthDate ? calendarAge(student.birthDate.toDate()) : null
  const details = [age !== null ? `גיל ${age} (הצהרה עצמית)` : null, student.instrument].filter(Boolean).join(' · ')
  const approved = student.linkStatus === 'approved'

  return (
    <Screen title={student.name} subtitle={details} top backTo="/teacher" backLabel="לרשימת התלמידים">
      {!approved ? (
        <p className="rounded-2xl bg-sky px-4 py-4 text-center text-base">
          הבקשה עדיין לא אושרה. אפשר לאשר אותה במסך הראשי.
        </p>
      ) : (
        <>
          <PracticeLine days={student.practiceDays} />

          <Button asChild size="large">
            <Link to={`/teacher/student/${studentId}/new-assignment`}>מטלה חדשה</Link>
          </Button>

          {student.isMinor && (
            <ConsentRequest studentId={studentId} hasConsent={Boolean(student.consentAt)} onChanged={() => void load()} />
          )}

          <section aria-labelledby="student-assignments-title" className="flex flex-col gap-3">
            <h2 id="student-assignments-title" className="text-xl font-bold">
              המטלות
            </h2>
            {assignments === null && !error && <p className="text-ink/60">רגע...</p>}
            {assignments !== null && (
              <AssignmentList
                assignments={assignments}
                hrefFor={(a) => `/teacher/student/${studentId}/assignment/${a.id}`}
                info={info}
                previewHrefFor={(a) => `/teacher/student/${studentId}/assignment/${a.id}/preview`}
                emptyText="עדיין אין מטלות. אפשר ליצור את הראשונה."
              />
            )}
          </section>

          <ErrorNote message={error} />
          {confirmingRemove ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-peach p-3">
              <p>להסיר את {student.name}? לא תהיה לך יותר גישה למידע שלהם. ההקלטות והמטלות נשארות אצלם.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button disabled={busy} onClick={() => void remove()}>
                  כן
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setConfirmingRemove(false)}>
                  ביטול
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" className="self-center py-3 text-base text-ink/70 underline" onClick={() => setConfirmingRemove(true)}>
              הסרת התלמיד/ה
            </button>
          )}
        </>
      )}
    </Screen>
  )
}
