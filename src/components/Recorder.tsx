import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorNote } from '@/components/ErrorNote'
import type { MetronomeControl } from '@/components/Metronome'
import { RecordingPlayer } from '@/components/RecordingPlayer'
import { Button } from '@/components/ui/button'
import { deleteMyRecording, type Item } from '@/lib/assignments'
import { db, storage } from '@/lib/firebase'
import { formatClock } from '@/lib/practiceTimer'
import { setRecordingActive, stopAllSound } from '@/lib/sound'

const MAX_SECONDS = 180
const MAX_BYTES = 5 * 1024 * 1024
const BITS_PER_SECOND = 96_000

type Recording = NonNullable<Item['recording']>
type Phase = 'idle' | 'asking' | 'recording' | 'review' | 'sending'

// The formats browsers record in: Chrome and Android WebM, Safari MP4, Firefox Ogg.
function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type))
}

function problemMessage(error: unknown): string {
  const name = (error as { name?: string }).name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'לא קיבלנו הרשאה למיקרופון. אפשר לאשר אותה בהגדרות של הדפדפן ולנסות שוב.'
  }
  if (name === 'NotFoundError') return 'לא מצאנו מיקרופון במכשיר.'
  return 'לא הצלחנו להתחיל להקליט. אפשר לנסות שוב.'
}

const formatDate = (ms: number | null) => {
  if (ms === null) return ''
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface Props {
  assignmentId: string
  itemId: string
  studentUid: string
  /** Minors can record only after the parent approved (the rules say the same). */
  canRecord: boolean
  existing: Recording | undefined
  metronome: MetronomeControl
}

// One recording per item, up to 3 minutes, with a visible countdown. The microphone is asked for
// only after the tap and is closed the moment the recording ends. Nothing is sent before the
// student listens and taps "send".
export function Recorder({ assignmentId, itemId, studentUid, canRecord, existing, metronome }: Props) {
  const [saved, setSaved] = useState<Recording | undefined>(existing)
  const [phase, setPhase] = useState<Phase>('idle')
  const [withMetronome, setWithMetronome] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [take, setTake] = useState<{ blob: Blob; url: string; seconds: number } | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sentNote, setSentNote] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const takeUrlRef = useRef<string | null>(null)

  const closeMicrophone = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setRecordingActive(false)
  }, [])

  const forgetTake = useCallback(() => {
    if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current)
    takeUrlRef.current = null
    setTake(null)
  }, [])

  // Leaving the screen: stop everything and release the microphone.
  useEffect(
    () => () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null
        recorder.stop()
      }
      closeMicrophone()
      if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current)
    },
    [closeMicrophone],
  )

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    metronome.stop()
    if (recorder && recorder.state !== 'inactive') recorder.stop() // continues in onstop
  }, [metronome])

  // The app was hidden (screen off, another app): the recording stops and what exists is kept.
  useEffect(() => {
    if (phase !== 'recording') return
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        setError('ההקלטה נעצרה כי יצאת מהאפליקציה. אפשר להאזין למה שהוקלט ולשלוח.')
        stop()
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [phase, stop])

  async function start() {
    setError(null)
    setSentNote(false)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('הדפדפן הזה לא תומך בהקלטה. אפשר לנסות בדפדפן אחר (Chrome או Safari).')
      return
    }
    // Nothing else plays while recording, except the metronome when it was chosen.
    stopAllSound()
    document.querySelectorAll('audio').forEach((audio) => audio.pause())
    forgetTake()
    setPhase('asking')
    try {
      // Music: no noise suppression or automatic volume, which would spoil it.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: BITS_PER_SECOND })
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        const seconds = Math.min(MAX_SECONDS, Math.max(1, Math.ceil((Date.now() - startedAtRef.current) / 1000)))
        const type = recorder.mimeType || mimeType || 'audio/webm'
        closeMicrophone()
        const blob = new Blob(chunks, { type })
        if (blob.size === 0) {
          setPhase('idle')
          setError('לא נקלט שום צליל. אפשר לנסות שוב.')
          return
        }
        if (blob.size > MAX_BYTES) {
          setPhase('idle')
          setError('ההקלטה גדולה מדי. אפשר להקליט קטע קצר יותר.')
          return
        }
        const url = URL.createObjectURL(blob)
        takeUrlRef.current = url
        setTake({ blob, url, seconds })
        setPhase('review')
      }
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      setElapsed(0)
      setRecordingActive(true)
      recorder.start(1000)
      if (withMetronome) metronome.start()
      timerRef.current = window.setInterval(() => {
        const seconds = (Date.now() - startedAtRef.current) / 1000
        setElapsed(seconds)
        if (seconds >= MAX_SECONDS) stop()
      }, 200)
      setPhase('recording')
    } catch (problem) {
      closeMicrophone()
      setPhase('idle')
      setError(problemMessage(problem))
    }
  }

  async function upload() {
    if (!take) return
    setPhase('sending')
    setError(null)
    try {
      const path = `recordings/${studentUid}/${assignmentId}/${itemId}`
      await uploadBytes(ref(storage, path), take.blob, { contentType: take.blob.type })
      await updateDoc(doc(db, 'assignments', assignmentId, 'items', itemId), {
        recording: { path, durationSeconds: take.seconds, uploadedAt: serverTimestamp() },
      })
      setSaved({ path, durationSeconds: take.seconds, uploadedAt: Date.now() })
      forgetTake()
      setConfirmReplace(false)
      setSentNote(true)
      setPhase('idle')
    } catch {
      setPhase('review')
      setError('לא הצלחנו לשלוח. אפשר לנסות שוב.')
    }
  }

  async function removeSaved() {
    setError(null)
    try {
      await deleteMyRecording(assignmentId, itemId)
      setSaved(undefined)
      setConfirmDelete(false)
      setSentNote(false)
    } catch {
      setError('המחיקה לא הצליחה. אפשר לנסות שוב.')
    }
  }

  const box = 'flex flex-col gap-3 rounded-2xl bg-peach/60 p-3'

  if (!canRecord) {
    return (
      <section aria-label="הקלטה" className={box}>
        <h4 className="text-base font-bold">הקלטה</h4>
        <p className="rounded-2xl bg-sky px-3 py-3 text-center text-base">ההקלטות ייפתחו אחרי שההורה יאשר במייל</p>
      </section>
    )
  }

  return (
    <section aria-label="הקלטה" className={box}>
      <h4 className="text-base font-bold">הקלטה</h4>

      {phase === 'recording' && (
        <>
          <p className="text-center text-4xl font-bold tabular-nums text-red-700" dir="ltr" data-testid="recording-countdown" aria-live="off">
            {formatClock(Math.max(0, MAX_SECONDS - elapsed) * 1000)}
          </p>
          <p className="text-center text-sm">מקליטים... נשארו עד שלוש דקות</p>
          <Button size="large" onClick={stop}>
            ■ עצירה
          </Button>
        </>
      )}

      {(phase === 'review' || phase === 'sending') && take && !confirmReplace && (
        <>
          <p className="text-sm">ההקלטה שלך ({formatClock(take.seconds * 1000)}). אפשר להאזין לפני שליחה.</p>
          <audio controls src={take.url} className="w-full" aria-label="ההקלטה החדשה" />
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={phase === 'sending'} onClick={() => (saved ? setConfirmReplace(true) : void upload())}>
              {phase === 'sending' ? 'שולחים...' : 'שליחה למורה'}
            </Button>
            <Button
              variant="outline"
              disabled={phase === 'sending'}
              onClick={() => {
                forgetTake()
                setPhase('idle')
              }}
            >
              הקלטה מחדש
            </Button>
          </div>
        </>
      )}

      {confirmReplace && take && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-3">
          <p>כבר יש הקלטה לפריט הזה. להחליף אותה בהקלטה החדשה? ההקלטה הקודמת תימחק.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={phase === 'sending'} onClick={() => void upload()}>
              {phase === 'sending' ? 'שולחים...' : 'להחליף'}
            </Button>
            <Button
              variant="outline"
              disabled={phase === 'sending'}
              onClick={() => {
                // Cancel: the new recording is thrown away, the old one stays.
                setConfirmReplace(false)
                forgetTake()
                setPhase('idle')
              }}
            >
              לבטל
            </Button>
          </div>
        </div>
      )}

      {(phase === 'idle' || phase === 'asking') && (
        <>
          {saved && (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                ההקלטה שלך{saved.uploadedAt ? ` (${formatDate(saved.uploadedAt)})` : ''} · <bdi>{formatClock(saved.durationSeconds * 1000)}</bdi>
              </p>
              <RecordingPlayer key={saved.uploadedAt ?? saved.path} path={saved.path} label="האזנה להקלטה שלי" />
              {confirmDelete ? (
                <div className="flex flex-col gap-2 rounded-2xl bg-white p-3">
                  <p className="text-sm">למחוק את ההקלטה? אי אפשר לבטל.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => void removeSaved()}>כן, למחוק</Button>
                    <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                      ביטול
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" className="self-start text-sm underline" onClick={() => setConfirmDelete(true)}>
                  מחיקת ההקלטה
                </button>
              )}
            </div>
          )}
          {sentNote && (
            <p role="status" className="rounded-2xl bg-sage px-3 py-2 text-center text-base">
              ✓ נשלח למורה
            </p>
          )}
          <label className="flex min-h-12 items-center gap-3 text-base">
            <input
              type="checkbox"
              className="size-6 shrink-0 accent-ink"
              checked={withMetronome}
              onChange={(e) => setWithMetronome(e.target.checked)}
            />
            <span>להקליט עם מטרונום (קצב {metronome.bpm})</span>
          </label>
          <Button size="large" disabled={phase === 'asking'} onClick={() => void start()}>
            {phase === 'asking' ? 'מבקשים הרשאה...' : saved ? '● הקלטה חדשה' : '● הקלטה'}
          </Button>
        </>
      )}
      <ErrorNote message={error} />
    </section>
  )
}
