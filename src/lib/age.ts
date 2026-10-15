// Same rule as the security rules: 18 years = 365.25 days per year, in milliseconds.
export const EIGHTEEN_YEARS_MS = 568036800000

export function isMinorAt(birth: Date, now: Date = new Date()): boolean {
  return now.getTime() - birth.getTime() < EIGHTEEN_YEARS_MS
}

// Age in whole years by calendar (for showing to people).
export function calendarAge(birth: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())
  if (beforeBirthday) age -= 1
  return age
}

// "2014-05-12" -> midnight UTC of that day, or null when it is not a real past date.
export function parseBirthDate(value: string, now: Date = new Date()): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  if (date.getUTCFullYear() < 1920 || date.getTime() >= now.getTime()) return null
  return date
}
