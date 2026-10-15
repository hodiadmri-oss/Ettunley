import { useAuth } from '@/auth/AuthProvider'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'

// Placeholder until the real home screens exist (phase 1, step 9).
export default function Home() {
  const { state, signOut } = useAuth()
  if (state.status !== 'ready') return null
  const { profile } = state

  const pendingTeacher = profile.role === 'teacher' && profile.teacherStatus !== 'approved'

  return (
    <Screen title={`שלום, ${profile.name}`}>
      <p className="rounded-2xl bg-sage px-4 py-4 text-center text-lg">
        {pendingTeacher
          ? 'החשבון שלך ממתין לאישור. נעדכן אותך כשהוא יאושר.'
          : profile.role === 'teacher'
            ? 'ברוכה הבאה, מורה!'
            : 'ברוכים הבאים! החשבון נוצר.'}
      </p>
      <Button variant="outline" onClick={() => void signOut()}>
        יציאה
      </Button>
    </Screen>
  )
}
