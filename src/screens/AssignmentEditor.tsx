import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createAssignment,
  deleteAssignment,
  draftProblem,
  draftProblemMessage,
  getAssignment,
  itemToDraft,
  listItems,
  MAX_ITEMS,
  updateAssignment,
  type AssignmentDraft,
  type Item,
  type ItemDraft,
  type ItemFiles,
} from '@/lib/assignments'
import { createdPaths, prepareItemFiles } from '@/lib/itemFiles'
import { audioProblemMessage, checkAudioFile, checkSheetFile, deleteSheet, sheetProblemMessage } from '@/lib/sheetFiles'
import { listTemplates, loadTemplate, saveAsTemplate, updateTemplate, type Template } from '@/lib/templates'
import { weekChoices, weekLabel, weekStartOf } from '@/lib/weeks'

const emptyItem = (): ItemDraft => ({ title: '', notes: '', youtube: '', bpm: '', hasRecording: false })

const selectClass =
  'min-h-12 w-full rounded-2xl border border-ink/20 bg-white px-4 py-3 text-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

// One optional file of an item (sheet music, backing track): shows what is attached and lets
// the teacher choose, replace or remove it.
function FilePicker({
  hint,
  haveText,
  accept,
  chosen,
  has,
  onPick,
  onClear,
}: {
  hint: string
  haveText: string
  accept: string
  chosen: File | undefined
  has: boolean
  onPick: (file: File | undefined) => void
  onClear: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {has ? (
        <p className="rounded-2xl bg-sage px-3 py-2 text-base">✓ {chosen ? `נבחר: ${chosen.name}` : haveText}</p>
      ) : (
        <p className="text-sm text-ink/60">{hint}</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="soft">
          <label>
            {has ? 'החלפת קובץ' : 'בחירת קובץ'}
            <input
              type="file"
              accept={accept}
              className="sr-only"
              onChange={(e) => {
                onPick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </Button>
        {has && (
          <Button type="button" variant="outline" onClick={onClear}>
            הסרת הקובץ
          </Button>
        )}
      </div>
    </div>
  )
}

// The teacher writes a weekly assignment for one student (or edits one): a title,
// a description, a daily goal and up to 10 practice items.
export default function AssignmentEditor({ mode = 'assignment' }: { mode?: 'assignment' | 'template' }) {
  const { studentId = '', assignmentId, templateId } = useParams()
  const isTemplate = mode === 'template'
  const { state } = useAuth()
  const navigate = useNavigate()
  const teacherUid = state.status === 'ready' ? state.user.uid : null
  const editing = isTemplate ? templateId !== undefined : assignmentId !== undefined
  const back = isTemplate
    ? editing
      ? `/teacher/area/template/${templateId}`
      : '/teacher/area'
    : `/teacher/student/${studentId}`
  const backLabel = isTemplate ? (editing ? 'לתבנית' : 'לאיזור המורה') : 'לתלמיד/ה'

  const [draft, setDraft] = useState<AssignmentDraft>(() => ({
    title: '',
    description: '',
    dailyGoalMinutes: 15,
    weekStart: weekStartOf(new Date()),
    items: [emptyItem()],
  }))
  const [goalText, setGoalText] = useState('15')
  const [existing, setExisting] = useState<Item[]>([])
  const [loaded, setLoaded] = useState(!editing)
  const [obsolete, setObsolete] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateSaved, setTemplateSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Stable keys for the item cards (an item has no id until it is saved).
  const [keys, setKeys] = useState<string[]>(() => [crypto.randomUUID()])

  useEffect(() => {
    if (!editing || !isTemplate || !templateId) return
    let cancelled = false
    void (async () => {
      try {
        const content = await loadTemplate(templateId, true)
        if (cancelled) return
        if (!content) return setLoadError('התבנית לא נמצאה.')
        setGoalText(String(content.dailyGoalMinutes))
        setDraft((d) => ({ ...d, title: content.title, description: content.description, dailyGoalMinutes: content.dailyGoalMinutes, items: content.items }))
        setKeys(content.items.map(() => crypto.randomUUID()))
        setLoaded(true)
      } catch {
        if (!cancelled) setLoadError('לא הצלחנו לטעון את התבנית. אפשר לנסות שוב.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editing, isTemplate, templateId])

  useEffect(() => {
    if (!editing || isTemplate || !assignmentId) return
    let cancelled = false
    void (async () => {
      try {
        const assignment = await getAssignment(assignmentId)
        if (cancelled) return
        if (!assignment || assignment.studentId !== studentId) return setLoadError('המטלה לא נמצאה.')
        const items = await listItems(assignmentId)
        if (cancelled) return
        setExisting(items)
        setGoalText(String(assignment.dailyGoalMinutes))
        setDraft({
          title: assignment.title,
          description: assignment.description,
          dailyGoalMinutes: assignment.dailyGoalMinutes,
          weekStart: assignment.weekStart,
          items: items.map(itemToDraft),
        })
        setKeys(items.map(() => crypto.randomUUID()))
        setLoaded(true)
      } catch {
        if (!cancelled) setLoadError('לא הצלחנו לטעון את המטלה. אפשר לנסות שוב.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editing, isTemplate, assignmentId, studentId])

  useEffect(() => {
    if (editing || isTemplate || !teacherUid) return
    let cancelled = false
    listTemplates(teacherUid)
      .then((list) => {
        if (!cancelled) setTemplates(list)
      })
      .catch(() => {
        // the list of templates is a convenience; the form works without it
      })
    return () => {
      cancelled = true
    }
  }, [editing, isTemplate, teacherUid])

  async function applyTemplate(id: string) {
    if (!id) return
    setError(null)
    try {
      const content = await loadTemplate(id)
      if (!content) return setError('התבנית לא נמצאה.')
      setDraft((d) => ({
        ...d,
        title: content.title,
        description: content.description,
        dailyGoalMinutes: content.dailyGoalMinutes,
        items: content.items.length > 0 ? content.items : [emptyItem()],
      }))
      setGoalText(String(content.dailyGoalMinutes))
      setKeys((content.items.length > 0 ? content.items : [emptyItem()]).map(() => crypto.randomUUID()))
    } catch {
      setError('לא הצלחנו לטעון את התבנית. אפשר לנסות שוב.')
    }
  }

  const setItem = (index: number, patch: Partial<ItemDraft>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) }))

  function addItem() {
    setDraft((d) => ({ ...d, items: [...d.items, emptyItem()] }))
    setKeys((k) => [...k, crypto.randomUUID()])
  }

  function removeItem(index: number) {
    const old = [draft.items[index].sheetPath, draft.items[index].accompanimentPath].filter((p): p is string => Boolean(p))
    if (old.length > 0) setObsolete((o) => [...o, ...old])
    setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))
    setKeys((k) => k.filter((_, i) => i !== index))
  }

  function pickSheet(index: number, file: File | undefined) {
    if (!file) return
    const problem = checkSheetFile(file)
    if (problem) {
      setError(sheetProblemMessage(problem))
      return
    }
    setError(null)
    const old = draft.items[index].sheetPath
    if (old) setObsolete((o) => [...o, old])
    setItem(index, { newSheet: file, sheetPath: undefined, copySheetFrom: undefined })
  }

  function clearSheet(index: number) {
    const old = draft.items[index].sheetPath
    if (old) setObsolete((o) => [...o, old])
    setItem(index, { newSheet: undefined, sheetPath: undefined, copySheetFrom: undefined })
  }

  function pickAccompaniment(index: number, file: File | undefined) {
    if (!file) return
    const problem = checkAudioFile(file)
    if (problem) {
      setError(audioProblemMessage(problem))
      return
    }
    setError(null)
    const old = draft.items[index].accompanimentPath
    if (old) setObsolete((o) => [...o, old])
    setItem(index, { newAccompaniment: file, accompanimentPath: undefined, copyAccompanimentFrom: undefined })
  }

  function clearAccompaniment(index: number) {
    const old = draft.items[index].accompanimentPath
    if (old) setObsolete((o) => [...o, old])
    setItem(index, { newAccompaniment: undefined, accompanimentPath: undefined, copyAccompanimentFrom: undefined })
  }

  // The form as a draft, or null (with the error shown) when something is missing.
  function validDraft(): AssignmentDraft | null {
    const goal = Number(goalText)
    const full: AssignmentDraft = { ...draft, dailyGoalMinutes: goalText.trim() === '' ? NaN : goal }
    const problem = draftProblem(full)
    if (problem) {
      setError(draftProblemMessage(problem))
      return null
    }
    return full
  }

  async function saveTemplate() {
    if (!teacherUid || busy) return
    const full = validDraft()
    if (!full) return
    setBusy(true)
    setError(null)
    setTemplateSaved(false)
    try {
      await saveAsTemplate(teacherUid, full)
      setTemplateSaved(true)
    } catch {
      setError('לא הצלחנו לשמור את התבנית. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  async function removeAssignment() {
    if (!assignmentId) return
    setBusy(true)
    setError(null)
    try {
      await deleteAssignment(assignmentId)
      navigate(back, { replace: true })
    } catch {
      setError('המחיקה לא הצליחה. אפשר לנסות שוב.')
      setBusy(false)
    }
  }

  async function save() {
    if (!teacherUid || busy) return
    const full = validDraft()
    if (!full) return
    setBusy(true)
    setError(null)
    setTemplateSaved(false)
    let files: ItemFiles[] = []
    try {
      if (isTemplate && !editing) {
        await saveAsTemplate(teacherUid, full)
      } else {
        files = await prepareItemFiles(teacherUid, full.items)
        if (isTemplate && templateId) await updateTemplate(templateId, full, files)
        else if (editing && assignmentId) await updateAssignment(assignmentId, full, files, existing)
        else await createAssignment(teacherUid, studentId, full, files)
      }
    } catch {
      // Files that were uploaded but are not referenced by anything are removed again.
      await Promise.all(createdPaths(files).map(deleteSheet))
      setError('לא הצלחנו לשמור. אפשר לנסות שוב.')
      setBusy(false)
      return
    }
    // A template removes the files it no longer uses itself.
    if (!isTemplate) await Promise.all(obsolete.map(deleteSheet))
    navigate(back, { replace: true })
  }

  if (loadError) {
    return (
      <Screen title={isTemplate ? 'תבנית' : 'מטלה'} top backTo={back}>
        <ErrorNote message={loadError} />
      </Screen>
    )
  }
  if (!loaded) {
    return (
      <Screen title="רגע..." top backTo={back}>
        <p className="text-center text-ink/60">טוענים את המטלה</p>
      </Screen>
    )
  }

  // Keep the current choice in the list even if it is an old week.
  const choices = weekChoices()
  if (!choices.some((c) => c.getTime() === draft.weekStart.getTime())) choices.unshift(draft.weekStart)

  return (
    <Screen
      title={isTemplate ? (editing ? 'עריכת תבנית' : 'תבנית חדשה') : editing ? 'עריכת מטלה' : 'מטלה חדשה'}
      top
      backTo={back}
      backLabel={backLabel}
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {!editing && !isTemplate && templates.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl bg-sky p-3">
            <Label htmlFor="template">להתחיל מתבנית (לא חובה)</Label>
            <select id="template" className={selectClass} defaultValue="" onChange={(e) => void applyTemplate(e.target.value)}>
              <option value="">בלי תבנית</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="title">כותרת</Label>
          <Input
            id="title"
            maxLength={100}
            placeholder="למשל: סולם דו מז׳ור ושיר"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">תיאור (לא חובה)</Label>
          <Textarea
            id="description"
            maxLength={1000}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </div>

        <div className={isTemplate ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal">יעד יומי (דקות)</Label>
            <Input
              id="goal"
              inputMode="numeric"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value.replace(/\D/g, '').slice(0, 3))}
            />
          </div>
          {!isTemplate && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="week">לאיזה שבוע</Label>
            <select
              id="week"
              className={selectClass}
              value={draft.weekStart.getTime()}
              onChange={(e) => setDraft({ ...draft, weekStart: new Date(Number(e.target.value)) })}
            >
              {choices.map((c) => (
                <option key={c.getTime()} value={c.getTime()}>
                  {weekLabel(c)}
                </option>
              ))}
            </select>
          </div>
          )}
        </div>

        <section aria-labelledby="items-title" className="flex flex-col gap-4">
          <h2 id="items-title" className="text-xl font-bold">
            פריטי תרגול
          </h2>
          {draft.items.map((item, index) => (
            <fieldset key={keys[index]} className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
              <legend className="px-1 text-base font-bold">פריט {index + 1}</legend>
              <Input
                aria-label={`שם פריט ${index + 1}`}
                maxLength={100}
                placeholder="שם הפריט (למשל: סולם, אטיוד, יצירה)"
                value={item.title}
                onChange={(e) => setItem(index, { title: e.target.value })}
              />
              <Textarea
                aria-label={`דגשים לתרגול בפריט ${index + 1}`}
                maxLength={1000}
                placeholder="דגשים לתרגול (לא חובה)"
                value={item.notes}
                onChange={(e) => setItem(index, { notes: e.target.value })}
              />
              <Input
                aria-label={`קישור ליוטיוב בפריט ${index + 1}`}
                dir="ltr"
                inputMode="url"
                autoComplete="off"
                placeholder="קישור ליוטיוב (לא חובה)"
                value={item.youtube}
                onChange={(e) => setItem(index, { youtube: e.target.value })}
              />
              <Input
                aria-label={`מטרונום בפריט ${index + 1}`}
                inputMode="numeric"
                placeholder="מטרונום, פעימות בדקה (לא חובה)"
                value={item.bpm}
                onChange={(e) => setItem(index, { bpm: e.target.value.replace(/\D/g, '').slice(0, 3) })}
              />

              <FilePicker
                hint="תווים (תמונה או PDF, לא חובה)"
                haveText="יש קובץ תווים"
                accept="image/*,application/pdf"
                chosen={item.newSheet}
                has={Boolean(item.newSheet || item.sheetPath || item.copySheetFrom)}
                onPick={(file) => pickSheet(index, file)}
                onClear={() => clearSheet(index)}
              />
              <FilePicker
                hint="קובץ ליווי (mp3, לא חובה)"
                haveText="יש קובץ ליווי"
                accept="audio/mpeg,.mp3"
                chosen={item.newAccompaniment}
                has={Boolean(item.newAccompaniment || item.accompanimentPath || item.copyAccompanimentFrom)}
                onPick={(file) => pickAccompaniment(index, file)}
                onClear={() => clearAccompaniment(index)}
              />

              {item.hasRecording ? (
                <p className="text-sm text-ink/60">אי אפשר להסיר פריט שכבר יש לו הקלטה.</p>
              ) : (
                draft.items.length > 1 && (
                  <button type="button" className="self-start text-sm underline" onClick={() => removeItem(index)}>
                    הסרת הפריט
                  </button>
                )
              )}
            </fieldset>
          ))}
          <Button type="button" variant="outline" disabled={draft.items.length >= MAX_ITEMS} onClick={addItem}>
            + הוספת פריט
          </Button>
        </section>

        <ErrorNote message={error} />
        <Button type="submit" size="large" disabled={busy}>
          {busy ? 'שומרים...' : 'שמירה'}
        </Button>
        {!isTemplate && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void saveTemplate()}>
            שמירה כתבנית
          </Button>
        )}
        {editing && !isTemplate && (
          confirmingDelete ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-peach p-3">
              <p>למחוק את המטלה? כל מה שקשור אליה יימחק, כולל ההקלטות של התלמיד/ה בה. אי אפשר לבטל.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" disabled={busy} onClick={() => void removeAssignment()}>
                  כן, למחוק
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmingDelete(false)}>
                  ביטול
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" className="self-center py-3 text-base text-ink/70 underline" onClick={() => setConfirmingDelete(true)}>
              מחיקת המטלה
            </button>
          )
        )}
        {templateSaved && (
          <p role="status" className="rounded-2xl bg-sage px-4 py-3 text-center text-base">
            ✓ נשמרה כתבנית. היא ב״איזור המורה שלי״.
          </p>
        )}
      </form>
    </Screen>
  )
}
