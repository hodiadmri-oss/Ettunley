import { useEffect, useState } from 'react'
import { ErrorNote } from '@/components/ErrorNote'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { getParentManageInfo, manageParentConsent } from '@/lib/accountApi'
import { HAS_PRIVACY_CONTACT, PRIVACY_CONTACT_EMAIL } from '@/lib/strings'

type View = 'loading' | 'invalid' | 'form' | 'withdrawn' | 'deleted'

// The parent's personal page: withdraw the consent, or delete everything of the child.
export default function ConsentManage() {
  const token = window.location.hash.replace(/^#/, '')
  const [view, setView] = useState<View>('loading')
  const [child, setChild] = useState('')
  const [hasConsent, setHasConsent] = useState(false)
  const [asking, setAsking] = useState<'withdraw' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getParentManageInfo(token)
      .then((info) => {
        if (cancelled) return
        if (info.valid) {
          setChild(info.childName)
          setHasConsent(info.hasConsent)
          setView('form')
        } else setView('invalid')
      })
      .catch(() => !cancelled && setView('invalid'))
    return () => {
      cancelled = true
    }
  }, [token])

  async function run(action: 'withdraw' | 'delete') {
    setBusy(true)
    setError(null)
    try {
      await manageParentConsent(token, action)
      setView(action === 'withdraw' ? 'withdrawn' : 'deleted')
    } catch {
      setError('הפעולה לא הצליחה. אפשר לנסות שוב.')
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
  if (view === 'invalid') {
    return (
      <Screen title="הקישור לא תקין">
        <p className="rounded-2xl bg-peach px-4 py-4 text-center text-lg">הקישור לא תקין.</p>
      </Screen>
    )
  }
  if (view === 'withdrawn') {
    return (
      <Screen title="האישור בוטל">
        <p className="rounded-2xl bg-sage px-4 py-4 text-center text-lg">
          האישור בוטל וההקלטות של {child} נמחקו. {child} יכול/ה להמשיך לתרגל בלי להקליט.
        </p>
      </Screen>
    )
  }
  if (view === 'deleted') {
    return (
      <Screen title="המידע נמחק">
        <p className="rounded-2xl bg-sage px-4 py-4 text-center text-lg">
          כל המידע של {child} נמחק לצמיתות.
        </p>
      </Screen>
    )
  }

  return (
    <Screen title="ניהול האישור" subtitle={child}>
      <p className="text-lg">
        {hasConsent
          ? `נתת אישור ש${child} ישתמש/תשתמש באפליקציה ושהקלטות התרגול יישמרו וישותפו עם המורה.`
          : `האישור ל${child} בוטל. אפשר גם למחוק את כל המידע.`}
      </p>
      <ErrorNote message={error} />

      {hasConsent && (
        <section className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="text-xl font-bold">ביטול האישור</h2>
          <p>ההקלטות של {child} יימחקו, ולא יהיה אפשר להקליט עד שתאשרו שוב.</p>
          {asking === 'withdraw' ? (
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={busy} onClick={() => void run('withdraw')}>
                כן, לבטל
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setAsking(null)}>
                לא
              </Button>
            </div>
          ) : (
            <Button variant="soft" onClick={() => setAsking('withdraw')}>
              ביטול האישור
            </Button>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-xl font-bold">מחיקת כל המידע</h2>
        <p>החשבון, ההקלטות, המטלות ותיעוד התרגול של {child} יימחקו לצמיתות. אי אפשר לבטל.</p>
        {asking === 'delete' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => void run('delete')}>
              כן, למחוק הכול
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setAsking(null)}>
              לא
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setAsking('delete')}>
            מחיקת כל המידע
          </Button>
        )}
      </section>

      {HAS_PRIVACY_CONTACT && <p className="text-center text-sm text-ink/70">שאלות: {PRIVACY_CONTACT_EMAIL}</p>}
    </Screen>
  )
}
