import type { Role } from '@/auth/profile'

// Where each role lands after signing in.
export const homePath = (role: Role) => (role === 'teacher' ? '/teacher' : '/student')
