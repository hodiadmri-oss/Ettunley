import { useEffect } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { HomeFooter } from '@/components/HomeFooter'
import { Screen } from '@/components/Screen'
import { EnterCode, WaitingForTeacher } from '@/screens/JoinTeacher'

// The student's home: name and teacher. A student without a confirmed teacher
// cannot do anything else yet, so they see the code screen or the waiting screen.
// Minors also see whether the parent has approved recording.
// (The assignments and practice arrive in the next phases.)
export default function StudentHome() {
  const { state, reloadProfile } = useAuth()

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reloadProfile()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reloadProfile])

  if (state.status !== 'ready') return null
  const { profile } = state

  if (!profile.teacherId) return <EnterCode />
  if (profile.linkStatus !== 'approved') return <WaitingForTeacher teacherName={profile.teacherName ?? ''} />

  return (
    <Screen title={`שלום, ${profile.name}`}>
      <p className="rounded-2xl bg-sage px-4 py-4 text-center text-lg">
        ברוכים הבאים! המורה שלך: {profile.teacherName}
      </p>
      {profile.isMinor && !profile.consentAt && (
        <p className="rounded-2xl bg-sky px-4 py-4 text-center text-base">
          ההקלטות ייפתחו אחרי שההורה יאשר במייל
        </p>
      )}
      {profile.isMinor && profile.consentAt && (
        <p className="rounded-2xl bg-sky px-4 py-4 text-center text-base">✓ ההורה אישר. אפשר להקליט</p>
      )}
      <HomeFooter />
    </Screen>
  )
}
