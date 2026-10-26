import { Link } from 'react-router-dom'
import type { Assignment } from '@/lib/assignments'
import { groupByWeek, weekLabel } from '@/lib/weeks'

// Assignments grouped by week, newest first. `hrefFor` decides where a tap goes
// (the student opens it, the teacher edits it).
export function AssignmentList({
  assignments,
  hrefFor,
  emptyText,
}: {
  assignments: Assignment[]
  hrefFor: (a: Assignment) => string
  emptyText: string
}) {
  if (assignments.length === 0) return <p className="text-ink/60">{emptyText}</p>
  return (
    <div className="flex flex-col gap-5">
      {groupByWeek(assignments).map((group) => (
        <section key={group.weekStart.getTime()} className="flex flex-col gap-2">
          <h3 className="text-base font-bold text-ink/70">{weekLabel(group.weekStart)}</h3>
          {group.items.map((a) => (
            <Link
              key={a.id}
              to={hrefFor(a)}
              className="flex min-h-14 flex-col justify-center gap-1 rounded-3xl bg-white px-4 py-3 shadow-sm"
            >
              <span className="text-lg font-bold">{a.title}</span>
              <span className="text-sm text-ink/60">יעד יומי: {a.dailyGoalMinutes} דקות</span>
            </Link>
          ))}
        </section>
      ))}
    </div>
  )
}
