import { useState } from 'react'
import { Link } from 'react-router-dom'
import { signOut as firebaseSignOut } from 'firebase/auth'
import { useAuth } from '@/auth/AuthProvider'
import { isLoginFresh, reauthWithGoogle, reauthWithPassword, usesPassword } from '@/auth/reauth'
import { ErrorNote } from '@/components/ErrorNote'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authErrorMessage } from '@/lib/authErrors'
import { DELETE_WORD, deleteMyAccount } from '@/lib/accountApi'
import { auth } from '@/lib/firebase'

// Settings and privacy. The big button here deletes the account and everything of
// the person for good.
export default function Settings() {
  const { state } = useAuth()
  const [typed, setTyped] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (state.status !== 'ready') return null
  const { user, profile } = state

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      if (!(await isLoginFresh(user))) {
        setNeedsLogin(true)
        return
      }
      await deleteMyAccount()
      await firebaseSignOut(auth).catch(() => undefined)
      window.location.assign('/welcome?deleted=1')
    } catch (e) {
      const code = (e as { code?: string; message?: string }).code
      if ((e as { message?: string }).message?.includes('recent-login-required')) setNeedsLogin(true)
      else setError(authErrorMessage(code) ?? 'המחיקה לא הצליחה. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmLogin() {
    setBusy(true)
    setError(null)
    try {
      if (usesPassword(user)) await reauthWithPassword(user, password)
      else await reauthWithGoogle(user)
      setNeedsLogin(false)
      setPassword('')
    } catch (e) {
      setError(authErrorMessage((e as { code?: string }).code) ?? 'האימות לא הצליח. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  const whatGoes =
    profile.role === 'teacher'
      ? 'הפרופיל, קוד ההזמנה, התבניות, הקבצים שהעלית, המטלות שיצרת וההקלטות שצורפו אליהן. התלמידים שלך יתנתקו ויישארו עם החשבון שלהם.'
      : 'הפרופיל, המטלות, ההקלטות, תיעוד התרגול והאישור של ההורה.'

  return (
    <Screen title="הגדרות" subtitle={profile.name}>
      <p className="text-center">
        <Link to="/privacy" className="font-medium underline">
          מדיניות פרטיות
        </Link>
      </p>

      <section aria-labelledby="delete-title" className="flex flex-col gap-4 rounded-3xl bg-white p-4 shadow-sm">
        <h2 id="delete-title" className="text-xl font-bold">
          מחיקת החשבון שלי
        </h2>
        <p>
          תימחק לצמיתות: {whatGoes} <strong>אי אפשר לבטל.</strong>
        </p>
        {needsLogin ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-peach p-3">
            <p>כדי להמשיך צריך להיכנס שוב, לביטחון.</p>
            {usesPassword(user) && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="reauth-password">סיסמה</Label>
                <Input
                  id="reauth-password"
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            <ErrorNote message={error} />
            <Button disabled={busy || (usesPassword(user) && password.length === 0)} onClick={() => void confirmLogin()}>
              {usesPassword(user) ? 'אישור' : 'כניסה מחדש עם Google'}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-word">להתחלה, כותבים: {DELETE_WORD}</Label>
              <Input id="delete-word" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
            <ErrorNote message={error} />
            <Button disabled={typed.trim() !== DELETE_WORD || busy} onClick={() => void remove()}>
              מחיקה סופית של החשבון
            </Button>
          </>
        )}
      </section>

      <Button asChild variant="outline">
        <Link to="/home">חזרה</Link>
      </Button>
    </Screen>
  )
}
