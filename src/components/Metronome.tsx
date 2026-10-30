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

export interface MetronomeControl {
  bpm: number
  setBpm: (bpm: number) => void
  change: (delta: number) => void
  playing: boolean
  start: () => void
  stop: () => void
}

// The metronome's engine and tempo. It lives with the item (not inside the metronome box), so
// the recording can start it too ("record with a metronome").
export function useMetronome(id: string, teacherBpm?: number): MetronomeControl {
  const [bpm, setBpmState] = useState(() => clamp(teacherBpm ?? DEFAULT_BPM))
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

  const start = useCallback(() => {
    if (timerRef.current !== null) return
    silentRef.current = allowSoundOnSilentSwitch()
    const context = contextRef.current ?? new AudioContext()
    contextRef.current = context
    void context.resume()
    // Phones may pause the sound when the microphone opens or the screen dims: wake it again.
    context.onstatechange = () => {
      if (context.state !== 'running' && timerRef.current !== null) void context.resume()
    }
    claimSound(id, stop)
    nextClickRef.current = context.currentTime + 0.05
    timerRef.current = window.setInterval(() => {
      if (context.state !== 'running') void context.resume()
      while (nextClickRef.current < context.currentTime + LOOK_AHEAD_SECONDS) {
        const at = nextClickRef.current
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.frequency.value = 1000
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(0.8, at + 0.002)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
        oscillator.connect(gain).connect(context.destination)
        oscillator.start(at)
        oscillator.stop(at + 0.06)
        nextClickRef.current += 60 / bpmRef.current
        if (import.meta.env.DEV) (window as unknown as { __etunleyClicks?: number }).__etunleyClicks = ((window as unknown as { __etunleyClicks?: number }).__etunleyClicks ?? 0) + 1
      }
    }, TICK_MS)
    setPlaying(true)
  }, [id, stop])

  const setBpm = useCallback((value: number) => setBpmState(clamp(value)), [])
  const change = useCallback((delta: number) => setBpmState((current) => clamp(current + delta)), [])
  return { bpm, setBpm, change, playing, start, stop }
}

// The metronome box: a tempo the student can change (a bar and − / +), with the teacher's
// tempo shown next to it.
export function Metronome({ control, teacherBpm }: { control: MetronomeControl; teacherBpm?: number }) {
  const { bpm, setBpm, change, playing, start, stop } = control
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
          onChange={(e) => setBpm(Number(e.target.value))}
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
        <button type="button" className="self-center text-sm underline" onClick={() => setBpm(teacherBpm)}>
          חזרה לקצב של המורה ({teacherBpm})
        </button>
      )}
    </section>
  )
}
