import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { allowSoundOnSilentSwitch, claimSound, releaseSound } from '@/lib/sound'

const MIN_BPM = 20
const MAX_BPM = 300
// The bar covers the tempos used in practice; the + button goes up to 300.
const SLIDER_MAX_BPM = 220
const DEFAULT_BPM = 60
const LOOK_AHEAD_SECONDS = 0.12
const TICK_MS = 25

const clamp = (bpm: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)))

// A metronome with a tempo the student can change. The teacher's tempo is shown next to it.
export function Metronome({ id, teacherBpm }: { id: string; teacherBpm?: number }) {
  const [bpm, setBpm] = useState(() => clamp(teacherBpm ?? DEFAULT_BPM))
  const [playing, setPlaying] = useState(false)
  const bpmRef = useRef(bpm)
  const contextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const silentRef = useRef<HTMLAudioElement | null>(null)
  const nextClickRef = useRef(0)

  useEffect(() => {
    bpmRef.current = bpm
  }, [bpm])

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
    silentRef.current?.pause()
    silentRef.current = null
    setPlaying(false)
    releaseSound(id)
  }, [id])

  useEffect(() => stop, [stop])

  function click(context: AudioContext, at: number) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 1000
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.8, at + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(at)
    oscillator.stop(at + 0.06)
  }

  function start() {
    silentRef.current = allowSoundOnSilentSwitch()
    const context = contextRef.current ?? new AudioContext()
    contextRef.current = context
    void context.resume()
    claimSound(id, stop)
    nextClickRef.current = context.currentTime + 0.05
    timerRef.current = window.setInterval(() => {
      while (nextClickRef.current < context.currentTime + LOOK_AHEAD_SECONDS) {
        click(context, nextClickRef.current)
        nextClickRef.current += 60 / bpmRef.current
      }
    }, TICK_MS)
    setPlaying(true)
  }

  const change = (delta: number) => setBpm((current) => clamp(current + delta))
  const step = 'size-12 shrink-0 rounded-full border border-ink/20 bg-white text-2xl font-medium'

  return (
    <section aria-label="מטרונום" className="flex flex-col gap-3 rounded-2xl bg-sky p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-base font-bold">מטרונום</h4>
        {teacherBpm !== undefined && <p className="text-sm">המורה ביקשה: {teacherBpm}</p>}
      </div>
      <p className="text-center text-4xl font-bold tabular-nums" aria-live="polite" aria-label="פעימות בדקה">
        {bpm}
      </p>
      <div className="flex items-center gap-2" dir="ltr">
        <button type="button" className={step} aria-label="להאט ב-1" onClick={() => change(-1)}>
          −
        </button>
        <input
          type="range"
          min={MIN_BPM}
          max={SLIDER_MAX_BPM}
          step={1}
          value={Math.min(bpm, SLIDER_MAX_BPM)}
          aria-label="קצב המטרונום"
          onChange={(e) => setBpm(clamp(Number(e.target.value)))}
          className="h-10 min-w-0 flex-1 accent-ink"
        />
        <button type="button" className={step} aria-label="להאיץ ב-1" onClick={() => change(1)}>
          +
        </button>
      </div>
      <Button variant={playing ? 'outline' : 'primary'} onClick={() => (playing ? stop() : start())}>
        {playing ? '■ עצירת המטרונום' : '▶ הפעלת המטרונום'}
      </Button>
      {teacherBpm !== undefined && bpm !== clamp(teacherBpm) && (
        <button type="button" className="self-center text-sm underline" onClick={() => setBpm(clamp(teacherBpm))}>
          חזרה לקצב של המורה ({teacherBpm})
        </button>
      )}
    </section>
  )
}
