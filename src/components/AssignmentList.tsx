import { Link } from 'react-router-dom'
import type { Assignment } from '@/lib/assignments'
import { formatClock } from '@/lib/practiceTimer'
import type { AssignmentInfo } from '@/lib/studentOverview'
import { groupByWeek, weekLabel } from '@/lib/weeks'

// Assignments grouped by week, newest first. `hrefFor` decides where a tap goes
// (the student opens it, the teacher edits it).
// A chip next to the title: "מוכן!" when every item is ready, otherwise "עובד/ת על זה" with how many are.
function StatusChip({ info }: { info: AssignmentInfo | undefined }) {
  if (!info || info.total === null || info.ready === null || info.total === 0) return null
  const allReady = info.ready === info.total
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${allReady ? 'bg-sage' : 'bg-peach'}`} data-testid="assignment-status">
      {allReady ? 'מוכן!' : `עובד/ת על זה${info.ready > 0 ? ` · ${info.ready}/${info.total}` : ''}`}
    </span>
  )
}

// "2 הקלטות חדשות": recordings the teacher has not listened to.
function WaitingBadge({ info }: { info: AssignmentInfo | undefined }) {
  if (!info?.waiting) return null
  return (
    <span className="shrink-0 rounded-full bg-ink px-3 py-1 text-sm font-medium text-white" data-testid="waiting-badge">
      {info.waiting === 1 ? 'הקלטה חדשה' : `${info.waiting} הקלטות חדשות`}
    </span>
  )
}

export function AssignmentList({
  assignments,
  hrefFor,
  emptyText,
  info,
  previewHrefFor,
}: {
  assignments: Assignment[]
  hrefFor: (a: Assignment) => string
  emptyText: string
  /** The student's home list: status and practice time next to each assignment. */
  info?: Record<string, AssignmentInfo>
  /** The teacher's list: a link under each assignment to see it as the student sees it. */
  previewHrefFor?: (a: Assignment) => string
}) {
  if (assignments.length === 0) return <p className="text-ink/60">{emptyText}</p>
  return (
    <div className="flex flex-col gap-5">
      {groupByWeek(assignments).map((group) => (
        <section key={group.weekStart.getTime()} className="flex flex-col gap-2">
          <h3 className="text-base font-bold text-ink/70">{weekLabel(group.weekStart)}</h3>
          {group.items.map((a) => (
            <div key={a.id} className="flex flex-col gap-1">
            <Link
              to={hrefFor(a)}
              className="flex min-h-14 flex-col justify-center gap-1 rounded-3xl bg-white px-4 py-3 shadow-sm"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-lg font-bold">{a.title}</span>
                <span className="flex flex-wrap items-center justify-end gap-1">
                  <WaitingBadge info={info?.[a.id]} />
                  <StatusChip info={info?.[a.id]} />
                </span>
              </span>
              <span className="flex items-center gap-1 text-sm text-ink/60">
                <span>יעד יומי: {a.dailyGoalMinutes} דקות</span>
                {info?.[a.id]?.todayMs !== undefined && info[a.id].todayMs !== null && (
                  <>
                    {info[a.id].todayMs! >= a.dailyGoalMinutes * 60000 && (
                      <span aria-label="הגעת ליעד היומי" className="font-bold text-ink" data-testid="goal-reached">
                        ✓
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <bdi className="tabular-nums" data-testid="practice-today">
                      {formatClock(info[a.id].todayMs ?? 0)}
                    </bdi>
                  </>
                )}
              </span>
            </Link>
            {previewHrefFor && (
              <Link to={previewHrefFor(a)} className="self-start rounded-xl px-4 py-2 text-sm underline">
                איך זה נראה אצל התלמיד/ה
              </Link>
            )}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
