import { describe, expect, it } from 'vitest'
import {
  describeSeconds, elapsedMs, finishTimer, formatClock, isTooOld, pauseTimer, recoverSession, resumeTimer, startTimer,
} from '../../src/lib/practiceTimer'

const S = 1000

describe('practice timer', () => {
  it('counts running time', () => {
    const t = startTimer(0)
    expect(elapsedMs(t, 30 * S)).toBe(30 * S)
  })

  it('does not count the time the screen was off', () => {
    let t = startTimer(0)
    t = pauseTimer(t, 20 * S) // screen off after 20 s
    expect(elapsedMs(t, 500 * S)).toBe(20 * S) // still 20 s much later
    t = resumeTimer(t, 500 * S)
    expect(elapsedMs(t, 510 * S)).toBe(30 * S)
  })

  it('pausing twice or resuming twice changes nothing', () => {
    let t = startTimer(0)
    t = pauseTimer(pauseTimer(t, 10 * S), 50 * S)
    expect(elapsedMs(t, 99 * S)).toBe(10 * S)
    t = resumeTimer(resumeTimer(t, 100 * S), 120 * S)
    expect(elapsedMs(t, 130 * S)).toBe(40 * S)
  })

  it('a clock that goes backwards never gives negative time', () => {
    const t = pauseTimer(startTimer(1000), 500)
    expect(elapsedMs(t, 0)).toBe(0)
  })

  it('saves a short exercise (a minute or less) but not a mis-tap', () => {
    expect(finishTimer(startTimer(0), 9 * S)).toBeNull()
    expect(finishTimer(startTimer(0), 10 * S)).toEqual({ seconds: 10, startedAt: 0, endedAt: 10 * S })
    expect(finishTimer(startTimer(0), 45 * S)?.seconds).toBe(45)
  })

  it('the result is always consistent with the security rule (seconds fit inside the session)', () => {
    let t = startTimer(1_000_000)
    t = pauseTimer(t, 1_000_000 + 30 * S)
    t = resumeTimer(t, 1_000_000 + 90 * S)
    const r = finishTimer(t, 1_000_000 + 125 * S)!
    expect(r.seconds).toBe(65)
    expect(r.seconds * 1000).toBeLessThanOrEqual(r.endedAt - r.startedAt + 5000)
  })

  it('recovers an unfinished session up to the last time it was stored, capped at an hour', () => {
    let t = startTimer(0)
    t = { ...t, savedAt: 5 * 60 * S } // last stored after 5 minutes of running
    expect(recoverSession(t)?.seconds).toBe(300)
    const forgotten = { ...startTimer(0), savedAt: 5 * 3600 * S }
    const r = recoverSession(forgotten)!
    expect(r.seconds).toBe(3600)
    expect(r.seconds * 1000).toBeLessThanOrEqual(r.endedAt - r.startedAt + 5000)
  })

  it('does not recover a session that is too short or too old', () => {
    expect(recoverSession({ ...startTimer(0), savedAt: 5 * S })).toBeNull()
    expect(isTooOld({ ...startTimer(0), savedAt: 0 }, 7 * 24 * 3600 * S)).toBe(true)
    expect(isTooOld({ ...startTimer(0), savedAt: 0 }, 3 * 24 * 3600 * S)).toBe(false)
  })

  it('formats the clock and the saved message in Hebrew', () => {
    expect(formatClock(65 * S)).toBe('01:05')
    expect(formatClock(0)).toBe('00:00')
    expect(describeSeconds(40)).toBe('40 שניות')
    expect(describeSeconds(60)).toBe('דקה')
    expect(describeSeconds(12 * 60)).toBe('12 דקות')
  })
})
