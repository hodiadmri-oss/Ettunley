import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'

// Small links at the bottom of both home screens: used rarely, so not big buttons.
export function HomeFooter() {
  const { state, signOut } = useAuth()
  const isAdmin = state.status === 'ready' && state.isAdmin
  const link = 'rounded-xl px-3 py-3 text-base text-ink/70 underline'
  return (
    <nav aria-label="עוד" className="flex flex-wrap items-center justify-center gap-x-2">
      {isAdmin && (
        <Link to="/admin" className={link}>
          ניהול
        </Link>
      )}
      <Link to="/settings" className={link}>
        הגדרות ופרטיות
      </Link>
      <button type="button" className={link} onClick={() => void signOut()}>
        יציאה
      </button>
    </nav>
  )
}
