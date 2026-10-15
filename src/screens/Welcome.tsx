import { Link } from 'react-router-dom'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { APP_NAME, APP_TAGLINE } from '@/lib/strings'

export default function Welcome() {
  return (
    <Screen title={APP_NAME} subtitle={APP_TAGLINE}>
      <div className="flex flex-col gap-3">
        <Button asChild size="large">
          <Link to="/signup">הרשמה</Link>
        </Button>
        <Button asChild size="large" variant="soft">
          <Link to="/login">כניסה</Link>
        </Button>
      </div>
    </Screen>
  )
}
