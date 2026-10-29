import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { Screen } from '@/components/Screen'
import { SheetViewer } from '@/components/SheetViewer'
import { YoutubeLink } from '@/components/YoutubeLink'
import { getAssignment, listItems, type Assignment, type Item } from '@/lib/assignments'
import { weekLabel } from '@/lib/weeks'

// The student opens one assignment and sees its practice items.
// (Practice, status and recording arrive in the next phases.)
export default function StudentAssignment() {
  const { assignmentId = '' } = useParams()
  const { state } = useAuth()
  const currentTeacher = state.status === 'ready' ? state.profile.teacherId : undefined
  const [data, setData] = useState<{ assignment: Assignment; items: Item[] } | null | 'missing'>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const assignment = await getAssignment(assignmentId)
        if (cancelled) return
        // An assignment of a previous teacher is not shown.
        if (!assignment || assignment.teacherId !== currentTeacher) return setData('missing')
        const items = await listItems(assignmentId)
        if (!cancelled) setData({ assignment, items })
      } catch {
        if (!cancelled) setError('לא הצלחנו לטעון את המטלה. אפשר לנסות שוב.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [assignmentId, currentTeacher])

  if (data === null) {
    return (
      <Screen title="רגע..." top backTo="/student">
        <ErrorNote message={error} />
      </Screen>
    )
  }
  if (data === 'missing') {
    return (
      <Screen title="המטלה לא נמצאה" top backTo="/student">
        <p className="text-center text-ink/70">אולי היא נמחקה.</p>
      </Screen>
    )
  }

  const { assignment, items } = data
  return (
    <Screen title={assignment.title} subtitle={weekLabel(assignment.weekStart)} top backTo="/student">
      {assignment.description && <p className="whitespace-pre-wrap rounded-2xl bg-sage px-4 py-4 text-base">{assignment.description}</p>}
      <p className="text-center text-base text-ink/70">יעד יומי: {assignment.dailyGoalMinutes} דקות</p>
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <article key={item.id} className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
            <h2 className="text-xl font-bold">{item.title}</h2>
            {item.notes && <p className="whitespace-pre-wrap text-base">{item.notes}</p>}
            {item.metronomeBpm && <p className="text-sm text-ink/60">מטרונום: {item.metronomeBpm}</p>}
            {item.sheetPath && <SheetViewer path={item.sheetPath} />}
            {item.youtubeUrl && <YoutubeLink url={item.youtubeUrl} />}
          </article>
        ))}
      </div>
    </Screen>
  )
}
