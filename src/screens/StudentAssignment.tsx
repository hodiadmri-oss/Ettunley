import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { PracticeItem } from '@/components/PracticeItem'
import { PracticeTimer } from '@/components/PracticeTimer'
import { Screen } from '@/components/Screen'
import { getAssignment, listItems, type Assignment, type Item } from '@/lib/assignments'
import { weekLabel } from '@/lib/weeks'

// The student opens one assignment: a timer for the whole assignment, and for each item the
// tips, sheet music, YouTube, backing track, a metronome and the student's own status.
// (Recording arrives in the next phase.)
export default function StudentAssignment({ preview = false }: { preview?: boolean }) {
  const { assignmentId = '', studentId = '' } = useParams()
  const { state } = useAuth()
  // The student sees only the current teacher's assignments; in the teacher's preview it is
  // her own assignment of that student.
  const currentTeacher = state.status === 'ready' ? (preview ? state.user.uid : state.profile.teacherId) : undefined
  const back = preview ? `/teacher/student/${studentId}/assignment/${assignmentId}` : '/student'
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
      <Screen title="רגע..." top backTo={back}>
        <ErrorNote message={error} />
      </Screen>
    )
  }
  if (data === 'missing') {
    return (
      <Screen title="המטלה לא נמצאה" top backTo={back}>
        <p className="text-center text-ink/70">אולי היא נמחקה.</p>
      </Screen>
    )
  }

  const { assignment, items } = data
  return (
    <Screen title={assignment.title} subtitle={weekLabel(assignment.weekStart)} top backTo={back} backLabel={preview ? 'למטלה' : 'חזרה'}>
      {preview && (
        <p className="rounded-2xl bg-sky px-4 py-3 text-center text-base">
          כך המסך נראה לתלמיד/ה. מה שהתלמיד/ה סימן/ה מופיע, ואי אפשר לשנות כאן.
        </p>
      )}
      {assignment.description && <p className="whitespace-pre-wrap rounded-2xl bg-sage px-4 py-4 text-base">{assignment.description}</p>}
      <p className="text-center text-base text-ink/70">יעד יומי: {assignment.dailyGoalMinutes} דקות</p>
      {state.status === 'ready' && (
        <PracticeTimer studentUid={preview ? studentId : state.user.uid} teacherId={assignment.teacherId} assignmentId={assignment.id} preview={preview} />
      )}
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <PracticeItem
            key={item.id}
            item={item}
            assignmentId={assignment.id}
            studentUid={preview ? studentId : state.status === 'ready' ? state.user.uid : ''}
            canRecord={state.status === 'ready' && Boolean(state.profile.consentAt)}
            preview={preview}
          />
        ))}
      </div>
    </Screen>
  )
}
