import { describe, expect, it } from 'vitest'
import { summarizePractice } from '../../src/lib/practiceSummary'

// Thursday 29 October 2026, noon in Israel
const NOW = new Date('2026-10-29T10:00:00Z')

describe('summarizePractice', () => {
  it('no practice at all', () => {
    expect(summarizePractice(undefined, NOW)).toEqual({ todaySeconds: 0, weekSeconds: 0, streak: 0 })
    expect(summarizePractice({}, NOW)).toEqual({ todaySeconds: 0, weekSeconds: 0, streak: 0 })
  })

  it('today, this week (from Sunday) and the streak', () => {
    const days = {
      '2026-10-29': 600, // Thursday (today)
      '2026-10-28': 300, // Wednesday
      '2026-10-27': 100, // Tuesday
      '2026-10-25': 50, // Sunday: still this week
      '2026-10-24': 999, // Saturday before: not this week
    }
    expect(summarizePractice(days, NOW)).toEqual({ todaySeconds: 600, weekSeconds: 1050, streak: 3 })
  })

  it('the streak survives a day that has not been practised yet today', () => {
    const days = { '2026-10-28': 60, '2026-10-27': 60, '2026-10-26': 60 }
    expect(summarizePractice(days, NOW).streak).toBe(3)
    expect(summarizePractice(days, NOW).todaySeconds).toBe(0)
  })

  it('but breaks when a whole day is missed', () => {
    expect(summarizePractice({ '2026-10-27': 60, '2026-10-26': 60 }, NOW).streak).toBe(0)
    expect(summarizePractice({ '2026-10-29': 60, '2026-10-27': 60 }, NOW).streak).toBe(1)
  })

  it('on a Sunday the week is just today', () => {
    const sunday = new Date('2026-10-25T10:00:00Z')
    expect(summarizePractice({ '2026-10-25': 40, '2026-10-24': 500 }, sunday)).toEqual({ todaySeconds: 40, weekSeconds: 40, streak: 2 })
  })
})
