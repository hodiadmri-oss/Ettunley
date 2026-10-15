import { Link, useSearchParams } from 'react-router-dom'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { APP_NAME, APP_TAGLINE } from '@/lib/strings'

export default function Welcome() {
  const [params] = useSearchParams()
  return (
    <Screen title={APP_NAME} subtitle={APP_TAGLINE}>
      {params.get('deleted') && (
        <p role="status" className="rounded-2xl bg-sage px-4 py-3 text-center text-lg">
          החשבון נמחק. תודה שהיית איתנו.
        </p>
      )}
      <div className="flex flex-col gap-3">
        <Button asChild size="large">
          <Link to="/signup">הרשמה</Link>
        </Button>
        <Button asChild size="large" variant="soft">
          <Link to="/login">כניסה</Link>
        </Button>
      </div>
      <p className="text-center">
        <Link to="/privacy" className="inline-flex min-h-11 items-center px-4 underline">
          מדיניות פרטיות
        </Link>
      </p>
    </Screen>
  )
}
