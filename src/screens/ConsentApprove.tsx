import { useEffect, useState } from 'react'
import { Screen } from '@/components/Screen'
import { ErrorNote } from '@/components/ErrorNote'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { approveParentConsent, getParentConsentInfo, type ConsentInfo } from '@/lib/consentApi'
import { CONSENT_TEXT_VERSION, HAS_PRIVACY_CONTACT, PRIVACY_CONTACT_EMAIL } from '@/lib/strings'

type View = 'loading' | 'invalid' | 'form' | 'done'

// Public page for a parent: no account, no sign-in. The personal link carries the
// secret in the part after "#", which browsers never send to servers.
export default function ConsentApprove() {
  const token = window.location.hash.replace(/^#/, '')
  const [view, setView] = useState<View>('loading')
  const [info, setInfo] = useState<Extract<ConsentInfo, { valid: true }> | null>(null)
  const [parentName, setParentName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getParentConsentInfo(token)
      .then((result) => {
        if (cancelled) return
        if (result.valid && result.textVersion === CONSENT_TEXT_VERSION) {
          setInfo(result)
          setView('form')
        } else {
          setView('invalid')
        }
      })
      .catch(() => !cancelled && setView('invalid'))
    return () => {
      cancelled = true
    }
  }, [token])

  async function approve() {
    setBusy(true)
    setError(null)
    try {
      await approveParentConsent(token, parentName, CONSENT_TEXT_VERSION)
      setView('done')
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'functions/failed-precondition') setView('invalid')
      else setError('האישור לא נשמר. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  if (view === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <p className="text-lg text-ink/60">רגע...</p>
      </main>
    )
  }

  if (view === 'invalid' || !info) {
    return (
      <Screen title="הקישור לא תקין">
        <p className="rounded-2xl bg-peach px-4 py-4 text-center text-lg">
          הקישור לא תקין או שפג תוקפו. אפשר לבקש מהמורה לשלוח אותו שוב.
        </p>
      </Screen>
    )
  }

  if (view === 'done') {
    return (
      <Screen title="תודה!">
        <p className="rounded-2xl bg-sage px-4 py-4 text-center text-lg">
          האישור נשמר. {info.childName} יכול/ה עכשיו להקליט. אפשר לסגור את הדף.
        </p>
        <p className="text-center text-sm text-ink/70">
          ההקלטות נמחקות אוטומטית אחרי 12 חודשים.
          {HAS_PRIVACY_CONTACT && ` לביטול האישור או למחיקת מידע אפשר לפנות אל ${PRIVACY_CONTACT_EMAIL}.`}
        </p>
      </Screen>
    )
  }

  return (
    <Screen title="אישור הורה" subtitle={`עבור ${info.childName}`}>
      <p className="text-lg">
        {info.teacherName} הזמין/ה את {info.childName} להשתמש באפליקציה לתרגול בין השיעורים. מכיוון ש
        {info.childName} קטין/ה, נדרש אישור שלך. האישור ניתן פעם אחת בלבד.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="parent-name">השם שלך</Label>
        <Input
          id="parent-name"
          autoComplete="name"
          maxLength={60}
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
        />
      </div>
      <label className="flex items-start gap-3 rounded-2xl bg-sage px-4 py-4 text-base">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 size-6 shrink-0 accent-ink"
        />
        <span>
          אני ההורה/האפוטרופוס ומאשר/ת ש{info.childName} ישתמש/תשתמש באפליקציה ושהקלטות התרגול יישמרו וישותפו עם
          המורה {info.teacherName}
        </span>
      </label>
      <p className="text-sm text-ink/70">
        ההקלטות נמחקות אוטומטית אחרי 12 חודשים, ואפשר לבקש מחיקה בכל זמן.
        {HAS_PRIVACY_CONTACT && ` פניות: ${PRIVACY_CONTACT_EMAIL}.`}
      </p>
      <ErrorNote message={error} />
      <Button size="large" disabled={!agreed || parentName.trim().length === 0 || busy} onClick={() => void approve()}>
        אישור
      </Button>
    </Screen>
  )
}
