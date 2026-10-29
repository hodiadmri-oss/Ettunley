// The practice timer counts only the time the app is on screen. When the screen turns off
// or the app is hidden the timer pauses; it continues when the app is shown again.
// All functions are pure (the clock is passed in) so they are easy to test.

export interface TimerState {
  /** When the practice began (wall clock, ms). */
  startedAt: number
  /** Practice time counted before the current running stretch (ms). */
  accumulatedMs: number
  /** Start of the current running stretch, or null while paused. */
  runningSince: number | null
  /** Last time the state was stored (ms). Used to recover a session that was not finished. */
  savedAt: number
}

export const MIN_SAVED_SECONDS = 10
// A recovered session is never longer than this (a forgotten timer must not log hours).
export const MAX_RECOVERED_SECONDS = 60 * 60

export function startTimer(now: number): TimerState {
  return { startedAt: now, accumulatedMs: 0, runningSince: now, savedAt: now }
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.runningSince === null) return { ...state, savedAt: now }
  return { ...state, accumulatedMs: state.accumulatedMs + Math.max(0, now - state.runningSince), runningSince: null, savedAt: now }
}

export function resumeTimer(state: TimerState, now: number): TimerState {
  if (state.runningSince !== null) return { ...state, savedAt: now }
  return { ...state, runningSince: now, savedAt: now }
}

export function elapsedMs(state: TimerState, now: number): number {
  return state.accumulatedMs + (state.runningSince === null ? 0 : Math.max(0, now - state.runningSince))
}

export interface PracticeResult {
  seconds: number
  startedAt: number
  endedAt: number
}

// What to store when the student presses "finished". null when it is too short to count.
export function finishTimer(state: TimerState, now: number): PracticeResult | null {
  const seconds = Math.round(elapsedMs(state, now) / 1000)
  if (seconds < MIN_SAVED_SECONDS) return null
  return { seconds, startedAt: state.startedAt, endedAt: Math.max(now, state.startedAt + seconds * 1000) }
}

// A session found in storage after the app was closed without "finished". It is counted up
// to the last moment it was stored (and at most an hour), never up to "now".
export function recoverSession(state: TimerState): PracticeResult | null {
  const counted = state.accumulatedMs + (state.runningSince === null ? 0 : Math.max(0, state.savedAt - state.runningSince))
  const seconds = Math.min(Math.round(counted / 1000), MAX_RECOVERED_SECONDS)
  if (seconds < MIN_SAVED_SECONDS) return null
  return { seconds, startedAt: state.startedAt, endedAt: Math.max(state.savedAt, state.startedAt + seconds * 1000) }
}

// The security rules accept only sessions that ended within the last 7 days.
export function isTooOld(state: TimerState, now: number): boolean {
  return now - state.savedAt > 6 * 24 * 3600 * 1000
}

// "00:17", "12:05", and "1:05:00" from an hour on.
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`
}
