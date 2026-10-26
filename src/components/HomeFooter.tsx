import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'

// The same three buttons at the bottom of both home screens.
export function HomeFooter() {
  const { state, signOut } = useAuth()
  const isAdmin = state.status === 'ready' && state.isAdmin
  return (
    <>
      {isAdmin && (
        <Button asChild variant="soft">
          <Link to="/admin">ניהול</Link>
        </Button>
      )}
      <Button asChild variant="soft">
        <Link to="/settings">הגדרות ופרטיות</Link>
      </Button>
      <Button variant="outline" onClick={() => void signOut()}>
        יציאה
      </Button>
    </>
  )
}
