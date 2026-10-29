import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DELETE_WORD, adminDeleteUser, adminLookupUser, type LookedUpUser } from '@/lib/accountApi'
import {
  approveTeacher,
  listTeacherFiles,
  listTeacherStudents,
  listTeachers,
  readTeacherFile,
  rejectTeacher,
  removeTeacherFile,
  type AdminFile,
  type AdminStudent,
  type TeacherRow,
} from '@/lib/adminApi'

type Action = { uid: string; kind: 'approve' | 'reject' }

function formatDate(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

const ROLE_LABEL = { teacher: 'מורה', student: 'תלמיד/ה', none: 'בלי פרופיל' } as const

// Owner-only page. The page is only a convenience: the Cloud Functions it calls
// check the admin claim themselves.

// For deletion requests that arrive by e-mail: find the person, confirm, delete for good.
function DeleteByRequest() {
  const [email, setEmail] = useState('')
  const [found, setFound] = useState<LookedUpUser | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function lookup() {
    setBusy(true)
    setError(null)
    setDone(false)
    setFound(null)
    setNotFound(false)
    setTyped('')
    try {
      const result = await adminLookupUser(email)
      if (result.found) setFound(result)
      else setNotFound(true)
    } catch {
      setError('החיפוש לא הצליח. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!found) return
    setBusy(true)
    setError(null)
    try {
      await adminDeleteUser(found.uid)
      setDone(true)
      setFound(null)
      setEmail('')
      setTyped('')
    } catch {
      setError('המחיקה לא הצליחה. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="rounded-3xl bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-lg font-bold" data-testid="delete-request-summary">
        מחיקת משתמש לפי אימייל
      </summary>
      <section aria-label="מחיקה לפי בקשה" className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-ink/70">לבקשות שהגיעו במייל. מוחק לצמיתות את המשתמש/ת וכל המידע שלהם/ן.</p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-email">האימייל של המשתמש/ת</Label>
          <Input id="delete-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button variant="soft" disabled={busy || !email.includes('@')} onClick={() => void lookup()}>
          חיפוש
        </Button>
        <ErrorNote message={error} />
        {notFound && <p>לא נמצא משתמש/ת עם האימייל הזה.</p>}
        {done && <p role="status" className="rounded-2xl bg-sage px-3 py-2">✓ נמחק</p>}
        {found && (
          <div className="flex flex-col gap-3 rounded-2xl bg-peach p-3">
            <p>
              <strong>{found.name || 'ללא שם'}</strong> ({ROLE_LABEL[found.role]})
            </p>
            {found.isAdmin ? (
              <p>אי אפשר למחוק מנהלת מכאן.</p>
            ) : (
              <>
                <Label htmlFor="admin-delete-word">לאישור כותבים: {DELETE_WORD}</Label>
                <Input id="admin-delete-word" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
                <Button disabled={busy || typed.trim() !== DELETE_WORD} onClick={() => void remove()}>
                  מחיקה סופית
                </Button>
              </>
            )}
          </div>
        )}
      </section>
    </details>
  )
}

// A file the teacher uploaded, shown through the owner's own sign-in (never a public link).
function FilePreview({ path }: { path: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'big' | 'unsupported'>('idle')
  const [url, setUrl] = useState<{ href: string; image: boolean } | null>(null)

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url.href)
    },
    [url],
  )

  async function show() {
    setState('loading')
    try {
      const file = await readTeacherFile(path)
      const bytes = Uint8Array.from(atob(file.dataBase64), (c) => c.charCodeAt(0))
      const image = /^image\/(jpeg|png|webp|gif)$/.test(file.contentType)
      if (!image && file.contentType !== 'application/pdf') return setState('unsupported')
      setUrl({ href: URL.createObjectURL(new Blob([bytes], { type: file.contentType })), image })
      setState('idle')
    } catch (error) {
      setState((error as { code?: string }).code === 'functions/failed-precondition' ? 'big' : 'error')
    }
  }

  if (url?.image) {
    return (
      <div className="flex flex-col gap-1">
        <img src={url.href} alt="הקובץ שהמורה העלתה" className="w-full rounded-xl border border-ink/10 bg-white" />
        <button type="button" className="self-start text-sm underline" onClick={() => setUrl(null)}>
          הסתרה
        </button>
      </div>
    )
  }
  if (url) {
    return (
      <a href={url.href} target="_blank" rel="noopener noreferrer" className="self-start text-sm underline">
        פתיחת ה-PDF בלשונית חדשה
      </a>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <button type="button" className="self-start text-sm underline" disabled={state === 'loading'} onClick={() => void show()}>
        {state === 'loading' ? 'טוענים...' : 'הצגת הקובץ'}
      </button>
      {state === 'error' && <p className="text-sm">לא הצלחנו לפתוח את הקובץ. אפשר לנסות שוב.</p>}
      {state === 'big' && <p className="text-sm">הקובץ גדול מדי להצגה כאן.</p>}
      {state === 'unsupported' && <p className="text-sm">אי אפשר להציג את סוג הקובץ הזה.</p>}
    </div>
  )
}

// The files one teacher uploaded: the owner can look at them and remove one.
function TeacherFiles({ teacherUid, version }: { teacherUid: string; version: number }) {
  const [files, setFiles] = useState<AdminFile[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const result = await listTeacherFiles(teacherUid)
      setFiles(result.files)
      setTruncated(result.truncated)
    } catch {
      setError('לא הצלחנו לטעון את הקבצים. אפשר לנסות שוב.')
    }
  }, [teacherUid])

  useEffect(() => {
    void load()
  }, [load, version])

  async function remove(path: string) {
    setBusy(true)
    setError(null)
    try {
      await removeTeacherFile(path)
      setConfirming(null)
      await load()
    } catch {
      setError('ההסרה לא הצליחה. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-bold">קבצים שהמורה העלתה{files ? ` (${files.length})` : ''}</h3>
      <ErrorNote message={error} />
      {files === null && !error && <p className="text-sm text-ink/60">רגע...</p>}
      {files !== null && files.length === 0 && <p className="text-sm text-ink/60">אין קבצים.</p>}
      {files?.map((file) => (
        <div key={file.path} className="flex flex-col gap-1 rounded-xl bg-white p-3">
          <p dir="auto" className="font-medium">{file.name || 'ללא שם'}</p>
          <p className="text-sm text-ink/60">
            <bdi>{formatSize(file.size)}</bdi> · <bdi>{formatDate(file.uploadedAt)}</bdi>
          </p>
          <p className="text-sm">
            {file.uses.length === 0
              ? 'לא בשימוש'
              : `בשימוש: ${file.uses.map((u) => `${u.kind === 'template' ? 'תבנית' : 'מטלה'} ״${u.title}״`).join(', ')}`}
          </p>
          <FilePreview path={file.path} />
          {confirming === file.path ? (
            <div className="flex flex-col gap-2 rounded-xl bg-peach p-2">
              <p className="text-sm">להסיר את הקובץ? הוא יימחק, והפריטים שהשתמשו בו יישארו בלי תווים.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button disabled={busy} onClick={() => void remove(file.path)}>
                  כן, להסיר
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setConfirming(null)}>
                  ביטול
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" className="self-start text-sm underline" onClick={() => setConfirming(file.path)}>
              הסרת הקובץ
            </button>
          )}
        </div>
      ))}
      {truncated && <p className="text-sm text-ink/60">מוצגים הקבצים האחרונים בלבד.</p>}
    </div>
  )
}

// The students connected to one teacher (names only).
function TeacherStudents({ teacherUid, version }: { teacherUid: string; version: number }) {
  const [students, setStudents] = useState<AdminStudent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listTeacherStudents(teacherUid)
      .then((list) => {
        if (!cancelled) setStudents(list)
      })
      .catch(() => {
        if (!cancelled) setError('לא הצלחנו לטעון את התלמידים. אפשר לנסות שוב.')
      })
    return () => {
      cancelled = true
    }
  }, [teacherUid, version])

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-bold">תלמידים מקושרים{students ? ` (${students.filter((s) => s.confirmed).length})` : ''}</h3>
      <ErrorNote message={error} />
      {students === null && !error && <p className="text-sm text-ink/60">רגע...</p>}
      {students !== null && students.length === 0 && <p className="text-sm text-ink/60">אין תלמידים.</p>}
      {students?.map((s, index) => (
        <p key={index} className="rounded-xl bg-white px-3 py-2">
          <span className="font-medium">{s.name}</span>
          <span className="text-sm text-ink/60">
            {[s.instrument, s.isMinor ? (s.hasConsent ? 'קטין/ה, ההורה אישר/ה' : 'קטין/ה, בלי אישור הורה') : null, s.confirmed ? null : 'ממתין/ה לאישור המורה']
              .filter(Boolean)
              .map((part) => ` · ${part}`)
              .join('')}
          </span>
        </p>
      ))}
    </div>
  )
}

// Deleting a teacher removes her account and everything she created. Her students stay
// (their own data is theirs) but are unlinked.
function DeleteTeacher({ teacher, onDone }: { teacher: TeacherRow; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await adminDeleteUser(teacher.uid)
      onDone()
    } catch {
      setError('המחיקה לא הצליחה. אפשר לנסות שוב.')
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="self-start text-sm text-ink/70 underline" onClick={() => setOpen(true)}>
        מחיקת המורה
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-peach p-3">
      <p>
        למחוק את {teacher.name}? החשבון שלה, המטלות, התבניות והקבצים שיצרה יימחקו לצמיתות. התלמידים שלה יתנתקו ויתבקשו קוד חדש (הנתונים שלהם נשארים אצלם). אי אפשר לבטל.
      </p>
      <Label htmlFor={`delete-word-${teacher.uid}`}>לאישור כותבים: {DELETE_WORD}</Label>
      <Input id={`delete-word-${teacher.uid}`} autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      <ErrorNote message={error} />
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy || typed.trim() !== DELETE_WORD} onClick={() => void remove()}>
          מחיקה סופית
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
          ביטול
        </Button>
      </div>
    </div>
  )
}

// An approved teacher: one line; tapping opens her students, her files and "delete".
function ApprovedTeacher({
  teacher,
  open,
  version,
  onToggle,
  onChanged,
}: {
  teacher: TeacherRow
  open: boolean
  version: number
  onToggle: () => void
  onChanged: () => void
}) {
  return (
    <article className="flex flex-col rounded-3xl bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-16 items-center justify-between gap-3 rounded-3xl px-4 py-3 text-start"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-lg font-bold">{teacher.name}</span>
          <span dir="ltr" className="truncate text-start text-sm text-ink/70">{teacher.email}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-ink/70">
          {teacher.studentCount} תלמידים
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-5 border-t border-ink/10 p-4">
          <TeacherStudents teacherUid={teacher.uid} version={version} />
          <TeacherFiles teacherUid={teacher.uid} version={version} />
          <DeleteTeacher teacher={teacher} onDone={onChanged} />
        </div>
      )}
    </article>
  )
}

export default function Admin() {
  const { state, signOut } = useAuth()
  const [teachers, setTeachers] = useState<TeacherRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Action | null>(null)
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setTeachers(await listTeachers())
      setVersion((v) => v + 1)
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
          <section aria-labelledby="approved-title" className="flex flex-col gap-3">
            <h2 id="approved-title" className="text-xl font-bold">
              מורים מאושרים ({approved.length})
            </h2>
            {approved.length === 0 && <p className="text-ink/60">עדיין אין.</p>}
            {approved.map((t) => (
              <ApprovedTeacher
                key={t.uid}
                teacher={t}
                open={openUid === t.uid}
                version={version}
                onToggle={() => setOpenUid(openUid === t.uid ? null : t.uid)}
                onChanged={() => {
                  setOpenUid(null)
                  void load()
                }}
              />
            ))}
          </section>

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
                  <DeleteTeacher teacher={t} onDone={() => void load()} />
                </article>
              )
            })}
          </section>
        </>
      )}

      <DeleteByRequest />

      <footer className="flex flex-col gap-3">
        {hasProfile && (
          <Button asChild variant="soft">
            <Link to="/">חזרה למסך הבית</Link>
          </Button>
        )}
        <Button variant="outline" onClick={() => void signOut()}>
          יציאה
        </Button>
      </footer>
    </main>
  )
}
