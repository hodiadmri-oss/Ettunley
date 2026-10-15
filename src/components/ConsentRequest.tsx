import { doc, getDoc, type Timestamp } from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ErrorNote } from '@/components/ErrorNote'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendConsentErrorMessage, sendParentConsent } from '@/lib/consentApi'
import { db } from '@/lib/firebase'

interface SentInfo {
  parentEmail: string
  sentAt: Date | null
  expired: boolean
}

const formatDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`

// For a minor student: the teacher types the parent's e-mail and sends the consent link.
export function ConsentRequest({ studentId, hasConsent, onChanged }: { studentId: string; hasConsent: boolean; onChanged: () => void }) {
  const [sent, setSent] = useState<SentInfo | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSent, setJustSent] = useState(false)

  const loadStatus = useCallback(async () => {
    if (hasConsent) return
    try {
      const snap = await getDoc(doc(db, 'parentConsents', studentId))
      const data = snap.data()
      if (!snap.exists() || !data) {
        setSent(null)
        return
      }
      const sentAt = (data.sentAt as Timestamp | undefined)?.toDate() ?? null
      const expiresAt = (data.expiresAt as Timestamp | undefined)?.toDate() ?? null
      setSent({ parentEmail: String(data.parentEmail), sentAt, expired: expiresAt !== null && expiresAt < new Date() })
    } catch {
      setSent(null)
    }
  }, [studentId, hasConsent])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  if (hasConsent) {
    return <p className="rounded-2xl bg-sage px-3 py-2">✓ ההורה אישר</p>
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await sendParentConsent(studentId, email)
      setJustSent(true)
      setEmail('')
      await loadStatus()
      onChanged()
    } catch (err) {
      setError(sendConsentErrorMessage((err as { code?: string }).code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-sky px-3 py-3">
      <p className="font-medium">ממתין לאישור הורה</p>
      {sent && (
        <p className="text-sm">
          {sent.expired ? 'הקישור שנשלח פג תוקף. ' : ''}נשלח אל <span dir="ltr">{sent.parentEmail}</span>
          {sent.sentAt ? ` ב-${formatDate(sent.sentAt)}` : ''}
        </p>
      )}
      {justSent && <p role="status" className="text-sm">✓ המייל נשלח</p>}
      <form onSubmit={submit} className="flex flex-col gap-2">
        <Input
          type="email"
          dir="ltr"
          inputMode="email"
          aria-label="אימייל של ההורה"
          placeholder="אימייל של ההורה"
          autoComplete="off"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <ErrorNote message={error} />
        <Button type="submit" disabled={busy}>
          {sent ? 'שליחה מחדש' : 'שליחה'}
        </Button>
        {sent && <p className="text-sm text-ink/70">אפשר לתקן את הכתובת ולשלוח שוב. הקישור הקודם יפסיק לעבוד.</p>}
      </form>
    </div>
  )
}
