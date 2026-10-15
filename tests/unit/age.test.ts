import { describe, expect, it } from 'vitest'
import { calendarAge, isMinorAt, parseBirthDate } from '../../src/lib/age'

const now = new Date('2026-10-15T09:00:00Z')

describe('age helpers', () => {
  it('a 10 year old is a minor, a 30 year old is not', () => {
    expect(isMinorAt(new Date('2016-03-01T00:00:00Z'), now)).toBe(true)
    expect(isMinorAt(new Date('1996-03-01T00:00:00Z'), now)).toBe(false)
  })

  it('someone who turned 18 months ago is an adult, someone turning 18 next month is a minor', () => {
    expect(isMinorAt(new Date('2008-06-01T00:00:00Z'), now)).toBe(false)
    expect(isMinorAt(new Date('2008-11-20T00:00:00Z'), now)).toBe(true)
  })

  it('calendar age counts birthdays', () => {
    expect(calendarAge(new Date('2014-10-16T00:00:00Z'), now)).toBe(11)
    expect(calendarAge(new Date('2014-10-15T00:00:00Z'), now)).toBe(12)
  })

  it('accepts only real past dates', () => {
    expect(parseBirthDate('2014-05-12', now)).not.toBeNull()
    expect(parseBirthDate('2014-02-30', now)).toBeNull()
    expect(parseBirthDate('2999-01-01', now)).toBeNull()
    expect(parseBirthDate('1800-01-01', now)).toBeNull()
    expect(parseBirthDate('0002-05-12', now)).toBeNull()
    expect(parseBirthDate('12.05.2014', now)).toBeNull()
  })
})
