import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import type { Profile } from '@/auth/profile'
import { ErrorNote } from '@/components/ErrorNote'
import { Button } from '@/components/ui/button'
import { calendarAge } from '@/lib/age'
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
}

type Action = { uid: string; kind: 'approve' | 'reject' }

const MAX_STUDENTS = 100

// The teacher's students: new requests first, then the confirmed ones.
export function StudentsList() {
  const { state } = useAuth()
  const [rows, setRows] = useState<StudentRow[] | null>(null)
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
          }
        }),
      )
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

      <section aria-labelledby="students-title" className="flex flex-col gap-3">
        <h2 id="students-title" className="text-xl font-bold">
          התלמידים שלי ({approved.length})
        </h2>
        {rows !== null && approved.length === 0 && (
          <p className="text-ink/60">עדיין אין תלמידים. אפשר לשלוח להם את הקוד שלמעלה.</p>
        )}
        {approved.map((row) => (
          <Link
            key={row.uid}
            to={`/teacher/student/${row.uid}`}
            className="flex min-h-16 items-center justify-between gap-3 rounded-3xl bg-white px-4 py-3 shadow-sm"
          >
            <span className="flex flex-col">
              <span className="text-lg font-bold">{row.name}</span>
              <span className="text-sm text-ink/60">{[row.instrument, row.age !== null ? `גיל ${row.age}` : null].filter(Boolean).join(' · ')}</span>
            </span>
            {row.isMinor && !row.hasConsent && (
              <span className="shrink-0 rounded-full bg-sky px-3 py-1 text-sm">ממתין לאישור הורה</span>
            )}
          </Link>
        ))}
      </section>
    </div>
  )
}
