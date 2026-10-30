import { useAuth } from '@/auth/AuthProvider'
import type { Assignment } from '@/lib/assignments'
import { summarizePractice } from '@/lib/practiceSummary'
import type { AssignmentInfo } from '@/lib/studentOverview'
import { weekStartOf } from '@/lib/weeks'

const minutes = (ms: number) => Math.floor(ms / 60000)

// Today's practice against the goal of this week's assignments (their daily goals added up),
// and the streak: days in a row with practice. Calm, one glance.
export function HomeProgress({ assignments, info }: { assignments: Assignment[]; info: Record<string, AssignmentInfo> }) {
  const { state } = useAuth()
  const days = state.status === 'ready' ? state.profile.practiceDays : undefined
  const { streak } = summarizePractice(days)

  const thisWeek = weekStartOf(new Date()).getTime()
  const current = assignments.filter((a) => a.weekStart.getTime() === thisWeek)
  const goal = current.reduce((sum, a) => sum + a.dailyGoalMinutes, 0)
  const todayMs = current.reduce((sum, a) => sum + (info[a.id]?.todayMs ?? 0), 0)
  const loaded = current.every((a) => info[a.id]?.todayMs !== null && info[a.id]?.todayMs !== undefined)
  const done = goal > 0 && loaded && todayMs >= goal * 60000
  const percent = goal > 0 ? Math.min(100, Math.round((todayMs / (goal * 60000)) * 100)) : 0

  return (
    <section aria-label="ההתקדמות שלי" className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm" data-testid="home-progress">
      {goal > 0 && loaded && (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-bold" data-testid="today-progress">
            {done ? 'הגעת ליעד של היום ✓' : `היום: ${minutes(todayMs)} מתוך ${goal} דקות`}
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="התקדמות להיום"
            className="h-4 w-full overflow-hidden rounded-full bg-peach/50"
          >
            <div className={`h-full rounded-full ${done ? 'bg-sage' : 'bg-ink/70'}`} style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      <p className="text-base text-ink/80" data-testid="streak">
        {streak > 0 ? `רצף: ${streak === 1 ? 'יום אחד' : `${streak} ימים ברצף`}` : 'מתחילים רצף חדש? מתרגלים היום'}
      </p>
    </section>
  )
}
