import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import type { Profile } from '@/auth/profile'
import { ErrorNote } from '@/components/ErrorNote'
import { Button } from '@/components/ui/button'
import { calendarAge } from '@/lib/age'
import { listRecordingAlerts, type RecordingAlert } from '@/lib/alerts'
import { summarizePractice } from '@/lib/practiceSummary'
import { formatClock } from '@/lib/practiceTimer'
import { db } from '@/lib/firebase'
import { respondToStudent } from '@/lib/linkApi'

interface StudentRow {
  uid: string
  name: string
  instrument?: string
  age: number | null
  linkStatus: 'pending' | 'approved'
  isMinor: boolean
  hasConsent: boolean
  practiceDays?: Record<string, number>
}

type Action = { uid: string; kind: 'approve' | 'reject' }

const MAX_STUDENTS = 100

// The teacher's students: new requests first, then the confirmed ones.
export function StudentsList() {
  const { state } = useAuth()
  const [rows, setRows] = useState<StudentRow[] | null>(null)
  const [alerts, setAlerts] = useState<RecordingAlert[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const teacherUid = state.status === 'ready' ? state.user.uid : null

  const load = useCallback(async () => {
    if (!teacherUid) return
    setError(null)
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('teacherId', '==', teacherUid), limit(MAX_STUDENTS)),
      )
      setRows(
        snap.docs.map((d) => {
          const p = d.data() as Profile
          return {
            uid: d.id,
            name: p.name,
            instrument: p.instrument,
            age: p.birthDate ? calendarAge(p.birthDate.toDate()) : null,
            linkStatus: p.linkStatus ?? 'pending',
            isMinor: p.isMinor === true,
            hasConsent: Boolean(p.consentAt),
            practiceDays: p.practiceDays,
          }
        }),
      )
      // "Recordings waiting": one small read, for all the students together.
      try {
        setAlerts(await listRecordingAlerts(teacherUid))
      } catch {
        setAlerts([])
      }
    } catch {
      setError('לא הצלחנו לטעון את התלמידים. אפשר לנסות שוב.')
    }
  }, [teacherUid])

  useEffect(() => {
    void load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  async function run(action: Action) {
    setBusy(true)
    setError(null)
    try {
      await respondToStudent(action.uid, action.kind)
      setConfirming(null)
      await load()
    } catch {
      setError('הפעולה לא הצליחה. אפשר לרענן ולנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  const pending = rows?.filter((r) => r.linkStatus === 'pending') ?? []
  const approved = rows?.filter((r) => r.linkStatus === 'approved') ?? []
  // Only students that are still hers count (an alert of a removed student is ignored).
  const nameOf = new Map(approved.map((r) => [r.uid, r.name]))
  const waiting = alerts.filter((a) => nameOf.has(a.studentId))
  const waitingBy = new Map<string, number>()
  for (const a of waiting) waitingBy.set(a.studentId, (waitingBy.get(a.studentId) ?? 0) + 1)

  const question = (row: StudentRow, kind: Action['kind']) =>
    kind === 'approve' ? `לאשר את ${row.name}?` : `לדחות את הבקשה של ${row.name}?`

  const details = (row: StudentRow) =>
    [row.age !== null ? `גיל ${row.age} (הצהרה עצמית)` : null, row.instrument].filter(Boolean).join(' · ')

  function Confirm({ row, kind }: { row: StudentRow; kind: Action['kind'] }) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl bg-peach p-3">
        <p>{question(row, kind)}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy} onClick={() => void run({ uid: row.uid, kind })}>
            כן
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setConfirming(null)}>
            ביטול
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ErrorNote message={error} />

      {pending.length > 0 && (
        <section aria-labelledby="requests-title" className="flex flex-col gap-3">
          <h2 id="requests-title" className="text-xl font-bold">
            בקשות הצטרפות ({pending.length})
          </h2>
          {pending.map((row) => (
            <article key={row.uid} className="flex flex-col gap-3 rounded-3xl bg-peach p-4">
              <div>
                <p className="text-lg font-bold">{row.name}</p>
                <p className="text-ink/70">{details(row)}</p>
              </div>
              {confirming?.uid === row.uid ? (
                <Confirm row={row} kind={confirming.kind} />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => setConfirming({ uid: row.uid, kind: 'approve' })}>אישור</Button>
                  <Button variant="outline" onClick={() => setConfirming({ uid: row.uid, kind: 'reject' })}>
                    דחייה
                  </Button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {waiting.length > 0 && (
        <section aria-labelledby="waiting-title" className="flex flex-col gap-2 rounded-3xl bg-ink p-4 text-white">
          <h2 id="waiting-title" className="text-lg font-bold">
            הקלטות שמחכות להאזנה ({waiting.length})
          </h2>
          {waiting.slice(0, 8).map((alert) => (
            <Link
              key={alert.id}
              to={`/teacher/student/${alert.studentId}/assignment/${alert.assignmentId}`}
              className="flex min-h-12 flex-col justify-center rounded-2xl bg-white/15 px-3 py-2"
            >
              <span className="font-bold">{nameOf.get(alert.studentId)}</span>
              <span className="text-sm text-white/80">
                {alert.assignmentTitle} · {alert.itemTitle}
              </span>
            </Link>
          ))}
          {waiting.length > 8 && <p className="text-sm text-white/80">ועוד {waiting.length - 8}. הן מסומנות ליד התלמידים.</p>}
        </section>
      )}

      <section aria-labelledby="students-title" className="flex flex-col gap-3">
        <h2 id="students-title" className="text-xl font-bold">
          התלמידים שלי ({approved.length})
        </h2>
        {rows !== null && approved.length === 0 && (
          <p className="text-ink/60">
            עדיין אין תלמידים. הקוד להצטרפות נמצא ב
            <Link to="/teacher/settings" className="underline">
              הגדרות
            </Link>
            .
          </p>
        )}
        {[...approved]
          .sort((x, y) => (waitingBy.get(y.uid) ?? 0) - (waitingBy.get(x.uid) ?? 0) || x.name.localeCompare(y.name, 'he'))
          .map((row) => {
            const summary = summarizePractice(row.practiceDays)
            const count = waitingBy.get(row.uid) ?? 0
            return (
              <Link
                key={row.uid}
                to={`/teacher/student/${row.uid}`}
                className="flex min-h-16 flex-col gap-2 rounded-3xl bg-white px-4 py-3 shadow-sm"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="text-lg font-bold">{row.name}</span>
                    <span className="text-sm text-ink/60">{[row.instrument, row.age !== null ? `גיל ${row.age}` : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-1">
                    {count > 0 && (
                      <span className="shrink-0 rounded-full bg-ink px-3 py-1 text-sm font-medium text-white" data-testid="student-waiting">
                        {count === 1 ? 'הקלטה חדשה' : `${count} הקלטות חדשות`}
                      </span>
                    )}
                    {row.isMinor && !row.hasConsent && <span className="shrink-0 rounded-full bg-sky px-3 py-1 text-sm">ממתין לאישור הורה</span>}
                    {row.isMinor && row.hasConsent && <span className="shrink-0 rounded-full bg-sage px-3 py-1 text-sm">ההורה אישר</span>}
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-3 text-sm text-ink/70" data-testid="student-practice">
                  <span>
                    היום <bdi className="tabular-nums">{formatClock(summary.todaySeconds * 1000)}</bdi>
                  </span>
                  <span>
                    השבוע <bdi className="tabular-nums">{formatClock(summary.weekSeconds * 1000)}</bdi>
                  </span>
                  <span>
                    רצף <bdi>{summary.streak}</bdi> {summary.streak === 1 ? 'יום' : 'ימים'}
                  </span>
                </span>
              </Link>
            )
          })}
      </section>
    </div>
  )
}
