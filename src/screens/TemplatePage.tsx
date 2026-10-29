import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { Screen } from '@/components/Screen'
import { SheetViewer } from '@/components/SheetViewer'
import { YoutubeLink } from '@/components/YoutubeLink'
import { Button } from '@/components/ui/button'
import { listApprovedStudents, type StudentSummary } from '@/lib/students'
import { assignTemplate, deleteTemplate, loadTemplate, type AssignResult, type TemplateContent } from '@/lib/templates'
import { weekChoices, weekLabel } from '@/lib/weeks'

const selectClass =
  'min-h-12 w-full rounded-2xl border border-ink/20 bg-white px-4 py-3 text-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

// One template: what is in it, "give it to students", edit and delete.
export default function TemplatePage() {
  const { templateId = '' } = useParams()
  const { state } = useAuth()
  const navigate = useNavigate()
  const teacherUid = state.status === 'ready' ? state.user.uid : null
  const [content, setContent] = useState<TemplateContent | null | 'missing'>(null)
  const [students, setStudents] = useState<StudentSummary[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [weekStart, setWeekStart] = useState(() => weekChoices()[1])
  const [result, setResult] = useState<AssignResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const load = useCallback(async () => {
    if (!teacherUid) return
    try {
      const [template, list] = await Promise.all([loadTemplate(templateId), listApprovedStudents(teacherUid)])
      setContent(template ?? 'missing')
      setStudents(list)
    } catch {
      setContent('missing')
    }
  }, [templateId, teacherUid])

  useEffect(() => {
    void load()
  }, [load])

  function toggle(uid: string) {
    setResult(null)
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  async function assign() {
    if (!teacherUid || !students || content === null || content === 'missing') return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const outcome = await assignTemplate(teacherUid, students.filter((s) => chosen.has(s.uid)), weekStart, content)
      setResult(outcome)
      setChosen(new Set(outcome.failed.length > 0 ? students.filter((s) => outcome.failed.includes(s.name)).map((s) => s.uid) : []))
    } catch {
      setError('השיוך לא הצליח. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteTemplate(templateId)
      navigate('/teacher/area', { replace: true })
    } catch {
      setError('המחיקה לא הצליחה. אפשר לנסות שוב.')
      setBusy(false)
    }
  }

  if (content === null) {
    return (
      <Screen title="רגע..." top backTo="/teacher/area" backLabel="לאיזור המורה">
        <p className="text-center text-ink/60">טוענים</p>
      </Screen>
    )
  }
  if (content === 'missing') {
    return (
      <Screen title="התבנית לא נמצאה" top backTo="/teacher/area" backLabel="לאיזור המורה">
        <p className="text-center text-ink/70">אולי היא נמחקה.</p>
      </Screen>
    )
  }

  const allChosen = students !== null && students.length > 0 && students.every((s) => chosen.has(s.uid))

  return (
    <Screen title={content.title} subtitle={`יעד יומי: ${content.dailyGoalMinutes} דקות`} top backTo="/teacher/area" backLabel="לאיזור המורה">
      {content.description && <p className="whitespace-pre-wrap rounded-2xl bg-sage px-4 py-4 text-base">{content.description}</p>}

      <section aria-labelledby="assign-title" className="flex flex-col gap-3 rounded-3xl bg-sky p-4">
        <h2 id="assign-title" className="text-xl font-bold">
          שיוך לתלמידים
        </h2>
        {students !== null && students.length === 0 && <p>עדיין אין תלמידים מאושרים.</p>}
        {students !== null && students.length > 0 && (
          <>
            <label className="flex min-h-12 items-center gap-3 text-base font-medium">
              <input
                type="checkbox"
                className="size-6 shrink-0 accent-ink"
                checked={allChosen}
                onChange={() => {
                  setResult(null)
                  setChosen(allChosen ? new Set() : new Set(students.map((s) => s.uid)))
                }}
              />
              כל התלמידים
            </label>
            {students.map((s) => (
              <label key={s.uid} className="flex min-h-12 items-center gap-3 text-base">
                <input type="checkbox" className="size-6 shrink-0 accent-ink" checked={chosen.has(s.uid)} onChange={() => toggle(s.uid)} />
                <span>
                  {s.name}
                  {s.instrument && <span className="text-sm text-ink/60"> · {s.instrument}</span>}
                </span>
              </label>
            ))}
            <label htmlFor="assign-week" className="text-base font-medium">
              לאיזה שבוע
            </label>
            <select
              id="assign-week"
              className={selectClass}
              value={weekStart.getTime()}
              onChange={(e) => setWeekStart(new Date(Number(e.target.value)))}
            >
              {weekChoices().map((c) => (
                <option key={c.getTime()} value={c.getTime()}>
                  {weekLabel(c)}
                </option>
              ))}
            </select>
            <Button disabled={busy || chosen.size === 0} onClick={() => void assign()}>
              {busy ? 'משייכים...' : chosen.size > 0 ? `שיוך (${chosen.size})` : 'שיוך'}
            </Button>
          </>
        )}
        {result && result.done.length > 0 && (
          <p role="status" className="rounded-2xl bg-sage px-4 py-3 text-base">
            ✓ המטלה נוספה ל: {result.done.join(', ')}
          </p>
        )}
        {result && result.failed.length > 0 && (
          <p role="alert" className="rounded-2xl bg-peach px-4 py-3 text-base">
            לא הצלחנו לשייך ל: {result.failed.join(', ')}. אפשר ללחוץ שוב.
          </p>
        )}
        <ErrorNote message={error} />
      </section>

      <section aria-labelledby="template-items-title" className="flex flex-col gap-3">
        <h2 id="template-items-title" className="text-xl font-bold">
          מה בתבנית
        </h2>
        {content.items.map((item, index) => (
          <article key={index} className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
            <h3 className="text-lg font-bold">{item.title}</h3>
            {item.notes && <p className="whitespace-pre-wrap text-base">{item.notes}</p>}
            {item.bpm && <p className="text-sm text-ink/60">מטרונום: {item.bpm}</p>}
            {item.copySheetFrom && <SheetViewer path={item.copySheetFrom} />}
            {item.youtube && <YoutubeLink url={item.youtube} />}
          </article>
        ))}
      </section>

      <Button asChild variant="soft">
        <Link to={`/teacher/area/template/${templateId}/edit`}>עריכת התבנית</Link>
      </Button>
      {confirmingDelete ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-peach p-3">
          <p>למחוק את התבנית? מטלות שכבר נוצרו ממנה לא ייפגעו.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => void remove()}>
              כן, למחוק
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmingDelete(false)}>
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" className="self-center py-3 text-base text-ink/70 underline" onClick={() => setConfirmingDelete(true)}>
          מחיקת התבנית
        </button>
      )}
    </Screen>
  )
}
