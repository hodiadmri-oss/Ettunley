import type { Role } from '@/auth/profile'
import { cn } from '@/lib/utils'

interface RolePickerProps {
  value: Role | null
  onChange: (role: Role) => void
  /** When false, "teacher" is shown but cannot be chosen. */
  teacherAllowed?: boolean
}

const OPTIONS: { role: Role; title: string; hint: string }[] = [
  { role: 'student', title: 'תלמיד/ה', hint: 'אני לומד/ת ומתרגל/ת' },
  { role: 'teacher', title: 'מורה', hint: 'אני מלמד/ת ומעניק/ה מטלות' },
]

export function RolePicker({ value, onChange, teacherAllowed = true }: RolePickerProps) {
  return (
    <div role="radiogroup" aria-label="תפקיד" className="grid grid-cols-2 gap-3">
      {OPTIONS.map(({ role, title, hint }) => {
        const disabled = role === 'teacher' && !teacherAllowed
        const selected = value === role
        return (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(role)}
            className={cn(
              'flex min-h-28 flex-col items-center justify-center gap-1 rounded-3xl border-2 p-4 text-center transition-colors disabled:opacity-40',
              selected ? 'border-ink bg-peach' : 'border-ink/15 bg-white',
            )}
          >
            <span className="text-xl font-bold">{title}</span>
            <span className="text-sm text-ink/70">{hint}</span>
          </button>
        )
      })}
    </div>
  )
}
