import { describe, expect, it } from 'vitest'
import { addWeeks, groupByWeek, weekChoices, weekLabel, weekStartOf } from '../../src/lib/weeks'

describe('weeks', () => {
  it('a week starts on Sunday at local midnight', () => {
    const monday = new Date(2026, 9, 26, 15, 30) // Monday 26 Oct 2026
    const start = weekStartOf(monday)
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getDay(), start.getHours()]).toEqual([2026, 9, 25, 0, 0])
    expect(weekStartOf(start).getTime()).toBe(start.getTime())
    const saturday = new Date(2026, 9, 31, 23, 59)
    expect(weekStartOf(saturday).getDate()).toBe(25)
  })

  it('adds weeks across a month change and the autumn clock change', () => {
    const start = new Date(2026, 9, 25)
    const later = addWeeks(start, 1)
    expect([later.getMonth(), later.getDate(), later.getHours()]).toEqual([10, 1, 0])
  })

  it('labels weeks in Hebrew', () => {
    const now = new Date(2026, 9, 26)
    expect(weekLabel(new Date(2026, 9, 25), now)).toBe('השבוע')
    expect(weekLabel(new Date(2026, 9, 18), now)).toBe('שבוע שעבר')
    expect(weekLabel(new Date(2026, 10, 1), now)).toBe('שבוע הבא')
    expect(weekLabel(new Date(2026, 8, 6), now)).toBe('שבוע 06.09')
  })

  it('offers last week, this week, next week and the one after', () => {
    const choices = weekChoices(new Date(2026, 9, 26))
    expect(choices.map((d) => d.getDate())).toEqual([18, 25, 1, 8])
  })

  it('groups newest week first and keeps the order inside a week', () => {
    const w1 = new Date(2026, 9, 18)
    const w2 = new Date(2026, 9, 25)
    const groups = groupByWeek([
      { id: 'a', weekStart: w1 },
      { id: 'b', weekStart: w2 },
      { id: 'c', weekStart: w1 },
    ])
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['b'], ['a', 'c']])
  })
})
