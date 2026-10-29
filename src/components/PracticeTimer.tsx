import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorNote } from '@/components/ErrorNote'
import { Button } from '@/components/ui/button'
import { clearSession, loadPracticeTotals, readSession, savePractice, writeSession, type PracticeTotals } from '@/lib/practice'
import {
  elapsedMs,
  finishTimer,
  formatClock,
  isTooOld,
  pauseTimer,
  recoverSession,
  resumeTimer,
  startTimer,
  type PracticeResult,
  type TimerState,
} from '@/lib/practiceTimer'

interface Props {
  studentUid: string
  teacherId: string
  assignmentId: string
  /** The teacher looking at what the student sees: nothing is saved. */
  preview?: boolean
}

type WakeLockSentinelLike = { release: () => Promise<void> }

// One timer for the whole assignment. It counts only while the app is on screen: when the
// screen goes off (or another app is opened) it pauses, and continues when the app is back.
// The screen is kept on while practising. A session that was not finished (the app was closed)
// is offered for saving the next time, up to an hour.
export function PracticeTimer({ studentUid, teacherId, assignmentId, preview = false }: Props) {
  const [state, setState] = useState<TimerState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [saved, setSaved] = useState<string | null>(null)
  const [recovered, setRecovered] = useState<PracticeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totals, setTotals] = useState<PracticeTotals | null>(null)
  const stateRef = useRef<TimerState | null>(null)
  const wakeLock = useRef<WakeLockSentinelLike | null>(null)

  const update = useCallback(
    (next: TimerState | null) => {
      stateRef.current = next
      setState(next)
      if (next) writeSession({ uid: studentUid, assignmentId, state: next })
      else clearSession(assignmentId)
    },
    [studentUid, assignmentId],
  )

  const releaseWakeLock = useCallback(() => {
    void wakeLock.current?.release().catch(() => undefined)
    wakeLock.current = null
  }, [])

  const requestWakeLock = useCallback(async () => {
    try {
      const api = (navigator as unknown as { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock
      if (api && !wakeLock.current) wakeLock.current = await api.request('screen')
    } catch {
      // not available (or refused): the timer works without it
    }
  }, [])

  // A session left behind by a closed app.
  useEffect(() => {
    if (preview) return
    const stored = readSession(studentUid, assignmentId)
    if (!stored) return
    const result = isTooOld(stored.state, Date.now()) ? null : recoverSession(stored.state)
    if (result) setRecovered(result)
    else clearSession(assignmentId)
  }, [studentUid, assignmentId, preview])

  // What was practised so far on this assignment (all sessions add up).
  useEffect(() => {
    if (preview) return
    let cancelled = false
    loadPracticeTotals(studentUid, assignmentId)
      .then((result) => {
        if (!cancelled) setTotals(result)
      })
      .catch(() => {
        // the totals are a convenience; the timer works without them
      })
    return () => {
      cancelled = true
    }
  }, [studentUid, assignmentId, preview])

  // While running: tick, pause when hidden, resume when shown.
  const running = state !== null
  useEffect(() => {
    if (!running) return
    void requestWakeLock()
    const tick = window.setInterval(() => {
      const at = Date.now()
      setNow(at)
      const current = stateRef.current
      if (current) writeSession({ uid: studentUid, assignmentId, state: { ...current, savedAt: at } })
    }, 1000)
    const onVisibility = () => {
      const current = stateRef.current
      if (!current) return
      const at = Date.now()
      if (document.visibilityState === 'hidden') {
        update(pauseTimer(current, at))
      } else {
        update(resumeTimer(current, at))
        setNow(at)
        void requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisibility)
      releaseWakeLock()
      // Leaving the screen without "finished": keep what was counted, so it can be offered later.
      const current = stateRef.current
      if (current) writeSession({ uid: studentUid, assignmentId, state: pauseTimer(current, Date.now()) })
    }
  }, [running, studentUid, assignmentId, update, requestWakeLock, releaseWakeLock])

  function start() {
    setSaved(null)
    setError(null)
    setRecovered(null)
    const at = Date.now()
    setNow(at)
    update(startTimer(at))
  }

  async function store(result: PracticeResult) {
    setBusy(true)
    setError(null)
    try {
      await savePractice(studentUid, teacherId, assignmentId, result)
      clearSession(assignmentId)
      stateRef.current = null
      setState(null)
      setRecovered(null)
      setSaved(`✓ נשמר: ${formatClock(result.seconds * 1000)}`)
      setTotals((current) => ({
        todayMs: (current?.todayMs ?? 0) + result.seconds * 1000,
        totalMs: (current?.totalMs ?? 0) + result.seconds * 1000,
      }))
    } catch {
      setError('לא הצלחנו לשמור. אפשר לנסות שוב.')
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    const current = stateRef.current
    if (!current) return
    const result = finishTimer(current, Date.now())
    if (!result) {
      update(null)
      setSaved('תרגול קצר מ-10 שניות לא נשמר.')
      return
    }
    await store(result)
  }

  return (
    <section aria-label="טיימר תרגול" className="flex flex-col gap-3 rounded-3xl bg-peach p-4">
      {recovered && !state && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-3">
          <p>היה תרגול שלא הסתיים: {formatClock(recovered.seconds * 1000)}. לשמור אותו?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => void store(recovered)}>
              כן, לשמור
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                clearSession(assignmentId)
                setRecovered(null)
              }}
            >
              לא, לזרוק
            </Button>
          </div>
        </div>
      )}

      {state ? (
        <>
          <p className="text-center text-5xl font-bold tabular-nums" dir="ltr" aria-live="off" data-testid="practice-clock">
            {formatClock(elapsedMs(state, now))}
          </p>
          <p className="text-center text-sm text-ink/70">הזמן נעצר כשהמסך כבוי</p>
          <Button size="large" disabled={busy} onClick={() => void finish()}>
            סיימתי
          </Button>
        </>
      ) : (
        <Button size="large" disabled={preview} onClick={start}>
          התחלתי לתרגל
        </Button>
      )}
      {preview && <p className="text-center text-sm text-ink/70">בתצוגה הזו אי אפשר לתרגל.</p>}
      {totals && totals.totalMs > 0 && (
        <p className="text-center text-sm text-ink/70" data-testid="practice-totals">
          היום: <bdi>{formatClock(totals.todayMs)}</bdi> · בסך הכול במטלה: <bdi>{formatClock(totals.totalMs)}</bdi>
        </p>
      )}
      {saved && <p role="status" className="rounded-2xl bg-sage px-4 py-3 text-center text-base">{saved}</p>}
      <ErrorNote message={error} />
    </section>
  )
}
