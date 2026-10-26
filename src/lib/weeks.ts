// Weeks start on Sunday (Israel). All dates are the device's local time.

export function weekStartOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - d.getDay())
  return d
}

export function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + weeks * 7)
  return d
}

export function formatDayMonth(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`
}

// "השבוע", "שבוע שעבר", "שבוע הבא", otherwise "שבוע 25.10".
export function weekLabel(weekStart: Date, now: Date = new Date()): string {
  const diffDays = Math.round((weekStart.getTime() - weekStartOf(now).getTime()) / 86400000)
  const weeks = Math.round(diffDays / 7)
  if (weeks === 0) return 'השבוע'
  if (weeks === -1) return 'שבוע שעבר'
  if (weeks === 1) return 'שבוע הבא'
  return `שבוע ${formatDayMonth(weekStart)}`
}

// The choices the teacher has for "which week is this assignment for".
export function weekChoices(now: Date = new Date()): Date[] {
  const current = weekStartOf(now)
  return [-1, 0, 1, 2].map((n) => addWeeks(current, n))
}

export function groupByWeek<T extends { weekStart: Date }>(items: T[]): { weekStart: Date; items: T[] }[] {
  const sorted = [...items].sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
  const groups: { weekStart: Date; items: T[] }[] = []
  for (const item of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.weekStart.getTime() === item.weekStart.getTime()) last.items.push(item)
    else groups.push({ weekStart: item.weekStart, items: [item] })
  }
  return groups
}
