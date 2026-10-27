import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { deleteTemplate, listTemplates, type Template } from '@/lib/templates'

// The teacher's saved templates. A template is created from an assignment
// ("שמירה כתבנית") and used from "מטלה חדשה".
export default function Templates() {
  const { state } = useAuth()
  const teacherUid = state.status === 'ready' ? state.user.uid : null
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!teacherUid) return
    try {
      setTemplates(await listTemplates(teacherUid))
    } catch {
      setError('לא הצלחנו לטעון את התבניות. אפשר לנסות שוב.')
    }
  }, [teacherUid])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(id: string) {
    setBusy(true)
    setError(null)
    try {
      await deleteTemplate(id)
      setConfirming(null)
      await load()
    } catch {
      setError('המחיקה לא הצליחה. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="התבניות שלי" top backTo="/teacher">
      <ErrorNote message={error} />
      {templates === null && !error && <p className="text-center text-ink/60">רגע...</p>}
      {templates !== null && templates.length === 0 && (
        <p className="text-center text-ink/70">
          עדיין אין תבניות. כשיוצרים או עורכים מטלה, לוחצים על ״שמירה כתבנית״.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {templates?.map((t) => (
          <article key={t.id} className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
            <div>
              <p className="text-lg font-bold">{t.title}</p>
              <p className="text-sm text-ink/60">יעד יומי: {t.dailyGoalMinutes} דקות</p>
            </div>
            {confirming === t.id ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-peach p-3">
                <p>למחוק את התבנית ״{t.title}״? מטלות שכבר נוצרו ממנה לא ייפגעו.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button disabled={busy} onClick={() => void remove(t.id)}>
                    כן, למחוק
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => setConfirming(null)}>
                    ביטול
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" className="self-start text-sm underline" onClick={() => setConfirming(t.id)}>
                מחיקה
              </button>
            )}
          </article>
        ))}
      </div>
    </Screen>
  )
}
