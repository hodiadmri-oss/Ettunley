// The teacher's list shows, for each student, today's practice, this week's practice and the streak
// of days in a row. They are computed from the per-day totals kept on the student's profile
// (`practiceDays`, written by a Function), by the clock in Israel.

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })

export const israelDay = (date: Date): string => DAY.format(date)

// The weekday (0 = Sunday) of a "2026-10-29" style day.
const weekdayOf = (day: string): number => new Date(`${day}T12:00:00Z`).getUTCDay()
const daysBefore = (date: Date, n: number): Date => new Date(date.getTime() - n * 24 * 3600 * 1000)

export interface PracticeSummary {
  todaySeconds: number
  weekSeconds: number
  /** Days in a row with practice, ending today (or yesterday, if today has none yet). */
  streak: number
}

export function summarizePractice(days: Record<string, number> | undefined, now: Date = new Date()): PracticeSummary {
  const data = days ?? {}
  const today = israelDay(now)
  const sinceSunday = weekdayOf(today)
  let weekSeconds = 0
  for (let i = 0; i <= sinceSunday; i++) weekSeconds += data[israelDay(daysBefore(now, i))] ?? 0

  let streak = 0
  let cursor = (data[today] ?? 0) > 0 ? 0 : 1
  while (cursor < 60 && (data[israelDay(daysBefore(now, cursor))] ?? 0) > 0) {
    streak++
    cursor++
  }
  return { todaySeconds: data[today] ?? 0, weekSeconds, streak }
}
