import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorNote } from '@/components/ErrorNote'
import { Button } from '@/components/ui/button'
import { regenerateInviteCode } from '@/lib/linkApi'

// The teacher's personal code with copy and share buttons, and "a new code" for
// the case that the code leaked.
export function InviteCodeCard({ code }: { code: string }) {
  const { reloadProfile } = useAuth()
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setError('לא הצלחנו להעתיק. אפשר לסמן את הקוד ולהעתיק ידנית.')
    }
  }

  async function share() {
    try {
      await navigator.share({ text: `הקוד שלי להצטרפות לאפליקציה: ${code}` })
    } catch {
      // closing the share sheet is not an error
    }
  }

  async function renew() {
    setBusy(true)
    setError(null)
    try {
      await regenerateInviteCode()
      await reloadProfile()
      setConfirming(false)
      setCopied(false)
    } catch {
      setError('לא הצלחנו ליצור קוד חדש. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="code-title" className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
      <h2 id="code-title" className="text-lg font-bold">
        הקוד שלך
      </h2>
      <p dir="ltr" data-testid="invite-code" className="select-all text-center text-4xl font-bold tracking-widest">
        {code}
      </p>
      <p className="text-center text-sm text-ink/60">תלמידים חדשים מקלידים אותו כדי להצטרף אלייך.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={() => void copy()}>
          {copied ? '✓ הועתק' : 'העתקה'}
        </Button>
        {typeof navigator.share === 'function' && (
          <Button variant="soft" onClick={() => void share()}>
            שיתוף
          </Button>
        )}
      </div>
      <ErrorNote message={error} />
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-peach p-3">
          <p>ליצור קוד חדש? הקוד הישן יפסיק לעבוד מיד. תלמידים שכבר הצטרפו לא יושפעו.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => void renew()}>
              כן, קוד חדש
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="text-center text-sm underline">
          הקוד דלף? יצירת קוד חדש
        </button>
      )}
    </section>
  )
}
