import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { Button } from '@/components/ui/button'
import { approveTeacher, listTeachers, rejectTeacher, type TeacherRow } from '@/lib/adminApi'

type Action = { uid: string; kind: 'approve' | 'reject' }

function formatDate(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

// Owner-only page. The page is only a convenience: the Cloud Functions it calls
// check the admin claim themselves.
export default function Admin() {
  const { state, signOut } = useAuth()
  const [teachers, setTeachers] = useState<TeacherRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setTeachers(await listTeachers())
    } catch {
      setError('לא הצלחנו לטעון את הרשימה. אפשר לנסות שוב.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: Action) {
    setBusy(true)
    setError(null)
    try {
      await (action.kind === 'approve' ? approveTeacher(action.uid) : rejectTeacher(action.uid))
      setConfirming(null)
      await load()
    } catch {
      setError('הפעולה לא הצליחה. אפשר לרענן ולנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  const pending = teachers?.filter((t) => t.status === 'pending') ?? []
  const approved = teachers?.filter((t) => t.status === 'approved') ?? []
  const hasProfile = state.status === 'ready'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">ניהול</h1>
        <Button variant="outline" onClick={() => void load()}>
          רענון
        </Button>
      </header>

      <ErrorNote message={error} />
      {teachers === null && !error && <p className="text-center text-ink/60">רגע...</p>}

      {teachers !== null && (
        <>
          <section aria-labelledby="pending-title" className="flex flex-col gap-3">
            <h2 id="pending-title" className="text-xl font-bold">
              ממתינים לאישור ({pending.length})
            </h2>
            {pending.length === 0 && <p className="text-ink/60">אין מורים שממתינים.</p>}
            {pending.map((t) => {
              const asking = confirming?.uid === t.uid ? confirming.kind : null
              const canApprove = t.copyrightStatementAt !== null && t.emailVerified
              return (
                <article key={t.uid} className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
                  <div>
                    <p className="text-lg font-bold">{t.name}</p>
                    <p dir="ltr" className="text-start text-ink/70">{t.email}</p>
                    <p className="text-sm text-ink/60">נרשמה ב-{formatDate(t.createdAt)}</p>
                    <p className="text-sm">
                      {t.copyrightStatementAt !== null
                        ? `✓ הצהרת זכויות יוצרים (${formatDate(t.copyrightStatementAt)})`
                        : 'עדיין לא אישרה את הצהרת זכויות היוצרים'}
                    </p>
                    {!t.emailVerified && <p className="text-sm">האימייל לא מאומת</p>}
                  </div>
                  {asking ? (
                    <div className="flex flex-col gap-2 rounded-2xl bg-peach p-3">
                      <p>{asking === 'approve' ? `לאשר את ${t.name}?` : `לדחות את ${t.name}? אי אפשר לבטל.`}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button disabled={busy} onClick={() => void run({ uid: t.uid, kind: asking })}>
                          כן
                        </Button>
                        <Button variant="outline" disabled={busy} onClick={() => setConfirming(null)}>
                          ביטול
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button disabled={!canApprove} onClick={() => setConfirming({ uid: t.uid, kind: 'approve' })}>
                        לאשר
                      </Button>
                      <Button variant="outline" onClick={() => setConfirming({ uid: t.uid, kind: 'reject' })}>
                        לדחות
                      </Button>
                    </div>
                  )}
                </article>
              )
            })}
          </section>

          <section aria-labelledby="approved-title" className="flex flex-col gap-3">
            <h2 id="approved-title" className="text-xl font-bold">
              מורים מאושרים ({approved.length})
            </h2>
            {approved.length === 0 && <p className="text-ink/60">עדיין אין.</p>}
            {approved.map((t) => (
              <article key={t.uid} className="rounded-3xl bg-white p-4 shadow-sm">
                <p className="text-lg font-bold">{t.name}</p>
                <p dir="ltr" className="text-start text-ink/70">{t.email}</p>
              </article>
            ))}
          </section>
        </>
      )}

      <footer className="flex flex-col gap-3">
        {hasProfile && (
          <Button asChild variant="soft">
            <Link to="/home">חזרה למסך הבית</Link>
          </Button>
        )}
        <Button variant="outline" onClick={() => void signOut()}>
          יציאה
        </Button>
      </footer>
    </main>
  )
}
