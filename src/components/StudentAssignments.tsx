import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { AssignmentList } from '@/components/AssignmentList'
import { ErrorNote } from '@/components/ErrorNote'
import { HomeProgress } from '@/components/HomeProgress'
import { NewReplies } from '@/components/NewReplies'
import { listReplyAlerts, type ReplyAlert } from '@/lib/alerts'
import { listAssignments, type Assignment } from '@/lib/assignments'
import { loadOverview, type AssignmentInfo } from '@/lib/studentOverview'

// The student's home list: every assignment, newest week first. Assignments never close.
export function StudentAssignments() {
  const { state } = useAuth()
  const uid = state.status === 'ready' ? state.user.uid : null
  // Only the current teacher's assignments are shown. Those of a previous teacher stay
  // stored (they are the student's own data) but do not appear.
  const teacherId = state.status === 'ready' ? (state.profile.teacherId ?? null) : null
  const [assignments, setAssignments] = useState<Assignment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<Record<string, AssignmentInfo>>({})
  const [alerts, setAlerts] = useState<ReplyAlert[]>([])

  useEffect(() => {
    if (!uid || !teacherId) return
    let cancelled = false
    const load = async () => {
      try {
        const list = await listAssignments(uid, teacherId)
        if (!cancelled) {
          setAssignments(list)
          setError(null)
        }
        const [overview, unread] = await Promise.all([loadOverview(uid, list), listReplyAlerts(uid).catch(() => [] as ReplyAlert[])])
        if (!cancelled) {
          setInfo(overview)
          setAlerts(unread)
        }
      } catch {
        if (!cancelled) setError('לא הצלחנו לטעון את המטלות. אפשר לנסות שוב.')
      }
    }
    void load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [uid, teacherId])

  return (
    <div className="flex flex-col gap-6">
    <NewReplies alerts={alerts} />
    {assignments !== null && <HomeProgress assignments={assignments} info={info} />}
    <section aria-labelledby="assignments-title" className="flex flex-col gap-3">
      <h2 id="assignments-title" className="text-xl font-bold">
        המטלות שלי
      </h2>
      <ErrorNote message={error} />
      {assignments === null && !error && <p className="text-ink/60">רגע...</p>}
      {assignments !== null && (
        <AssignmentList
          assignments={assignments}
          hrefFor={(a) => `/student/assignment/${a.id}`}
          emptyText="עדיין אין מטלות. כשהמורה תוסיף, הן יופיעו כאן."
          info={info}
          newReplies={Object.fromEntries(alerts.map((a) => [a.assignmentId, a.count]))}
        />
      )}
    </section>
    </div>
  )
}
