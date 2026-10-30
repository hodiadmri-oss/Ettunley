import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { RecordingPlayer } from '@/components/RecordingPlayer'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAssignment, isWaiting, listItems, type Assignment, type Item } from '@/lib/assignments'
import { addReply, editReply, listComments, markHeard, MAX_COMMENT_LENGTH, type Comment } from '@/lib/comments'
import { formatClock } from '@/lib/practiceTimer'
import { weekLabel } from '@/lib/weeks'

const formatDate = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

// One item from the teacher's side: what the student marked, the recording (with a "new" mark until
// she listens) and a short reply. Listening, or replying, counts as "heard".
function ItemForTeacher({ assignment, item, teacherUid, onHeard }: { assignment: Assignment; item: Item; teacherUid: string; onHeard: (itemId: string) => void }) {
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const waiting = isWaiting(item)

  const loadComments = useCallback(async () => {
    try {
      setComments(await listComments(assignment.id, item.id))
    } catch {
      setError('לא הצלחנו לטעון את התגובות. אפשר לנסות שוב.')
    }
  }, [assignment.id, item.id])

  useEffect(() => {
    if (item.recording) void loadComments()
  }, [item.recording, loadComments])

  async function heard() {
    if (!waiting) return
    try {
      await markHeard(assignment.id, item.id)
      onHeard(item.id)
    } catch {
      // the mark is a convenience; listening still works
    }
  }

  async function send() {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await addReply(assignment.id, item.id, teacherUid, text)
      setText('')
      onHeard(item.id)
      await loadComments()
    } catch {
      setError('לא הצלחנו לשלוח. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editing || !editing.text.trim()) return
    setBusy(true)
    setError(null)
    try {
      await editReply(assignment.id, item.id, editing.id, editing.text)
      setEditing(null)
      await loadComments()
    } catch {
      setError('לא הצלחנו לשמור. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{item.title}</h2>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${item.status === 'ready' ? 'bg-sage' : 'bg-peach'}`} data-testid="item-status">
          {item.status === 'ready' ? 'מוכן!' : 'עובד/ת על זה'}
        </span>
      </div>

      {!item.recording ? (
        <p className="text-sm text-ink/60">עדיין אין הקלטה.</p>
      ) : (
        <section aria-label="הקלטה" className="flex flex-col gap-3 rounded-2xl bg-peach/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold">
              הקלטה{item.recording.uploadedAt ? ` (${formatDate(item.recording.uploadedAt)})` : ''} · <bdi>{formatClock(item.recording.durationSeconds * 1000)}</bdi>
            </h3>
            {waiting && (
              <span className="shrink-0 rounded-full bg-ink px-3 py-1 text-sm font-medium text-white" data-testid="new-recording">
                חדש
              </span>
            )}
          </div>
          <RecordingPlayer key={item.recording.uploadedAt ?? item.recording.path} path={item.recording.path} onPlay={() => void heard()} />

          <div className="flex flex-col gap-2">
            {comments?.map((c) => (
              <div key={c.id} className="flex flex-col gap-1 rounded-xl bg-white p-3">
                {editing?.id === c.id ? (
                  <>
                    <Input aria-label="עריכת התגובה" maxLength={MAX_COMMENT_LENGTH} value={editing.text} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <Button disabled={busy} onClick={() => void saveEdit()}>
                        שמירה
                      </Button>
                      <Button variant="outline" onClick={() => setEditing(null)}>
                        ביטול
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap">{c.text}</p>
                    <p className="flex items-center justify-between gap-2 text-xs text-ink/60">
                      <span>
                        {formatDate(c.createdAt)} · {c.readAt ? 'התלמיד/ה קרא/ה' : 'עוד לא נקרא'}
                      </span>
                      {!c.readAt && (
                        <button type="button" className="underline" onClick={() => setEditing({ id: c.id, text: c.text })}>
                          עריכה
                        </button>
                      )}
                    </p>
                  </>
                )}
              </div>
            ))}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <Input
                aria-label="תגובה קצרה"
                placeholder="תגובה קצרה לתלמיד/ה"
                maxLength={MAX_COMMENT_LENGTH}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <Button type="submit" disabled={busy || !text.trim()}>
                שליחה
              </Button>
            </form>
          </div>
        </section>
      )}
      <ErrorNote message={error} />
    </article>
  )
}

// The teacher's screen for one assignment: the student's statuses and recordings, and replies.
export default function TeacherAssignment() {
  const { studentId = '', assignmentId = '' } = useParams()
  const { state } = useAuth()
  const teacherUid = state.status === 'ready' ? state.user.uid : null
  const back = `/teacher/student/${studentId}`
  const [data, setData] = useState<{ assignment: Assignment; items: Item[] } | null | 'missing'>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!teacherUid) return
    let cancelled = false
    void (async () => {
      try {
        const assignment = await getAssignment(assignmentId)
        if (cancelled) return
        if (!assignment || assignment.studentId !== studentId || assignment.teacherId !== teacherUid) return setData('missing')
        const items = await listItems(assignmentId)
        if (!cancelled) setData({ assignment, items })
      } catch {
        if (!cancelled) setError('לא הצלחנו לטעון את המטלה. אפשר לנסות שוב.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [assignmentId, studentId, teacherUid])

  // After "I listened" the new mark disappears at once (the saved time is the server's).
  function onHeard(itemId: string) {
    setData((current) =>
      current && current !== 'missing'
        ? { ...current, items: current.items.map((i) => (i.id === itemId ? { ...i, recordingSeenAt: Date.now() + 60_000 } : i)) }
        : current,
    )
  }

  if (data === null) {
    return (
      <Screen title="רגע..." top backTo={back} backLabel="לתלמיד/ה">
        <ErrorNote message={error} />
      </Screen>
    )
  }
  if (data === 'missing') {
    return (
      <Screen title="המטלה לא נמצאה" top backTo={back} backLabel="לתלמיד/ה">
        <p className="text-center text-ink/70">אולי היא נמחקה.</p>
      </Screen>
    )
  }

  const { assignment, items } = data
  const waitingCount = items.filter(isWaiting).length
  return (
    <Screen title={assignment.title} subtitle={`${weekLabel(assignment.weekStart)} · יעד יומי: ${assignment.dailyGoalMinutes} דקות`} top backTo={back} backLabel="לתלמיד/ה">
      {waitingCount > 0 && (
        <p className="rounded-2xl bg-ink px-4 py-3 text-center text-base text-white">
          {waitingCount === 1 ? 'יש הקלטה אחת חדשה' : `יש ${waitingCount} הקלטות חדשות`}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="soft">
          <Link to={`/teacher/student/${studentId}/assignment/${assignmentId}/edit`}>עריכת המטלה</Link>
        </Button>
        <Button asChild variant="soft">
          <Link to={`/teacher/student/${studentId}/assignment/${assignmentId}/preview`}>איך זה נראה אצל התלמיד/ה</Link>
        </Button>
      </div>
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <ItemForTeacher key={item.id} assignment={assignment} item={item} teacherUid={teacherUid ?? ''} onHeard={onHeard} />
        ))}
      </div>
    </Screen>
  )
}
