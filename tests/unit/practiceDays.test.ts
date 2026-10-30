import { describe, expect, it } from 'vitest'
import { addToDays, israelDay } from '../../functions/src/recordings'

describe('practice days (the per-day totals on the profile)', () => {
  it('names the day by the clock in Israel', () => {
    expect(israelDay(new Date('2026-10-29T10:00:00Z'))).toBe('2026-10-29')
    // 23:30 UTC is already the next day in Israel (UTC+2 in winter, +3 in summer)
    expect(israelDay(new Date('2026-10-29T23:30:00Z'))).toBe('2026-10-30')
    expect(israelDay(new Date('2026-07-01T21:30:00Z'))).toBe('2026-07-02')
  })

  it('adds sessions of the same day together', () => {
    let days: Record<string, number> = {}
    days = addToDays(days, '2026-10-29', 600, '2026-10-29')
    days = addToDays(days, '2026-10-29', 75, '2026-10-29')
    days = addToDays(days, '2026-10-28', 30, '2026-10-29')
    expect(days).toEqual({ '2026-10-29': 675, '2026-10-28': 30 })
  })

  it('keeps only the last 60 days', () => {
    const old = { '2026-01-01': 100, '2026-09-01': 200, '2026-10-20': 300 }
    const result = addToDays(old, '2026-10-29', 50, '2026-10-29')
    expect(result).toEqual({ '2026-09-01': 200, '2026-10-20': 300, '2026-10-29': 50 })
  })
})
