import { Link } from 'react-router-dom'
import type { ReplyAlert } from '@/lib/alerts'

// The first thing on the student's home: replies from the teacher that were not read yet.
// Opening the assignment shows the full reply and takes the mark away.
export function NewReplies({ alerts }: { alerts: ReplyAlert[] }) {
  if (alerts.length === 0) return null
  return (
    <section aria-label="תגובות חדשות מהמורה" className="flex flex-col gap-2">
      {alerts.map((a) => (
        <Link
          key={a.id}
          to={`/student/assignment/${a.assignmentId}`}
          className="flex min-h-14 flex-col gap-1 rounded-3xl bg-sky px-4 py-3 shadow-sm"
          data-testid="new-reply-card"
        >
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-ink px-3 py-1 text-sm font-medium text-white">חדש</span>
            <span className="text-lg font-bold">תגובה מהמורה</span>
          </span>
          {a.preview && <span className="text-base">{a.preview}</span>}
          <span className="text-sm text-ink/60">
            {a.assignmentTitle}
            {a.itemTitle ? ` · ${a.itemTitle}` : ''}
          </span>
        </Link>
      ))}
    </section>
  )
}
