import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'

interface PasswordInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
}

export function PasswordInput({ id, value, onChange, autoComplete }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    // Passwords are typed left-to-right, so this field is LTR.
    <div dir="ltr" className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="pe-14"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
        className="absolute inset-y-0 end-0 flex w-14 items-center justify-center text-ink/60"
      >
        {visible ? <EyeOff className="size-6" /> : <Eye className="size-6" />}
      </button>
    </div>
  )
}
