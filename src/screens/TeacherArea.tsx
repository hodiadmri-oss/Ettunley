import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { Screen } from '@/components/Screen'
import { TeacherTabs } from '@/components/TeacherTabs'
import { Button } from '@/components/ui/button'
import { listTemplates, type Template } from '@/lib/templates'

// "The teacher's area": assignments written once, saved as templates, and given to as
// many students as the teacher wants.
export default function TeacherArea() {
  const { state } = useAuth()
  const teacherUid = state.status === 'ready' ? state.user.uid : null
  const approved = state.status === 'ready' && state.profile.teacherStatus === 'approved'
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!teacherUid || !approved) return
    let cancelled = false
    listTemplates(teacherUid)
      .then((list) => {
        if (!cancelled) setTemplates(list)
      })
      .catch(() => {
        if (!cancelled) setError('לא הצלחנו לטעון את התבניות. אפשר לנסות שוב.')
      })
    return () => {
      cancelled = true
    }
  }, [teacherUid, approved])

  if (!approved) return <Navigate to="/teacher" replace />

  return (
    <Screen title="איזור המורה שלי" top>
      <TeacherTabs />
      <p className="text-center text-base text-ink/70">
        כאן שומרים מטלות כתבניות, ומשייכים אותן לתלמידים, כמה שרוצים בבת אחת.
      </p>
      <Button asChild size="large">
        <Link to="/teacher/area/new-template">+ תבנית חדשה</Link>
      </Button>
      <ErrorNote message={error} />
      {templates === null && !error && <p className="text-center text-ink/60">רגע...</p>}
      {templates !== null && templates.length === 0 && (
        <p className="text-center text-ink/70">
          עדיין אין תבניות. אפשר ליצור אחת כאן, או ללחוץ על ״שמירה כתבנית״ במטלה של תלמיד/ה.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {templates?.map((t) => (
          <Link
            key={t.id}
            to={`/teacher/area/template/${t.id}`}
            className="flex min-h-16 flex-col justify-center gap-1 rounded-3xl bg-white px-4 py-3 shadow-sm"
          >
            <span className="text-lg font-bold">{t.title}</span>
            <span className="text-sm text-ink/60">יעד יומי: {t.dailyGoalMinutes} דקות</span>
          </Link>
        ))}
      </div>
    </Screen>
  )
}
