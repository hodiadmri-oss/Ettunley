import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { useState } from 'react'
import { db } from '@/lib/firebase'

type Status = 'working' | 'ready'

// The student's mark for one item: still working on it, or ready. Saved as soon as it is tapped.
export function ItemStatus({ assignmentId, itemId, initial }: { assignmentId: string; itemId: string; initial: Status }) {
  const [status, setStatus] = useState<Status>(initial)
  const [failed, setFailed] = useState(false)

  async function choose(next: Status) {
    if (next === status) return
    const before = status
    setStatus(next)
    setFailed(false)
    try {
      await updateDoc(doc(db, 'assignments', assignmentId, 'items', itemId), {
        status: next,
        statusUpdatedAt: serverTimestamp(),
      })
    } catch {
      setStatus(before)
      setFailed(true)
    }
  }

  const base = 'min-h-12 rounded-2xl px-3 text-base font-medium border border-ink/20'
  const options: { value: Status; label: string }[] = [
    { value: 'working', label: 'עובד/ת על זה' },
    { value: 'ready', label: 'מוכן!' },
  ]
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="איפה אני עם הפריט" className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={status === option.value}
            onClick={() => void choose(option.value)}
            className={`${base} ${status === option.value ? (option.value === 'ready' ? 'bg-sage font-bold' : 'bg-peach font-bold') : 'bg-white'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {failed && <p role="alert" className="text-sm">לא הצלחנו לשמור. אפשר לנסות שוב.</p>}
    </div>
  )
}
