import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorNote } from '@/components/ErrorNote'
import { Button } from '@/components/ui/button'
import { clearSession, readSession, savePractice, writeSession } from '@/lib/practice'
import {
  describeSeconds,
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
}

type WakeLockSentinelLike = { release: () => Promise<void> }

// One timer for the whole assignment. It counts only while the app is on screen: when the
// screen goes off (or another app is opened) it pauses, and continues when the app is back.
// The screen is kept on while practising. A session that was not finished (the app was closed)
// is offered for saving the next time, up to an hour.
export function PracticeTimer({ studentUid, teacherId, assignmentId }: Props) {
  const [state, setState] = useState<TimerState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [saved, setSaved] = useState<string | null>(null)
  const [recovered, setRecovered] = useState<PracticeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef<TimerState | null>(null)
  const wakeLock = useRef<WakeLockSentinelLike | null>(null)

  const update = useCallback(
    (next: TimerState | null) => {
      stateRef.current = next
      setState(next)
      if (next) writeSession({ uid: studentUid, assignmentId, state: next })
      else clearSession()
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
    const stored = readSession()
    if (!stored || stored.uid !== studentUid || stored.assignmentId !== assignmentId) return
    const result = isTooOld(stored.state, Date.now()) ? null : recoverSession(stored.state)
    if (result) setRecovered(result)
    else clearSession()
  }, [studentUid, assignmentId])

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
      clearSession()
      stateRef.current = null
      setState(null)
      setRecovered(null)
      setSaved(`✓ נשמר: ${describeSeconds(result.seconds)} של תרגול`)
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
          <p>היה תרגול שלא הסתיים: {describeSeconds(recovered.seconds)}. לשמור אותו?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => void store(recovered)}>
              כן, לשמור
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                clearSession()
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
        <Button size="large" onClick={start}>
          התחלתי לתרגל
        </Button>
      )}
      {saved && <p role="status" className="rounded-2xl bg-sage px-4 py-3 text-center text-base">{saved}</p>}
      <ErrorNote message={error} />
    </section>
  )
}
