import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { claimSound, isActiveSound, releaseSound, silentSoundUrl } from '@/lib/sound'
import { loadSheet } from '@/lib/sheetFiles'
import { formatClock } from '@/lib/practiceTimer'

const SKIP_SECONDS = 10

// The backing track: play, pause, and move to any point (a bar to drag, and 10 seconds back
// or forward) to start from a passage. No tempo change and no looping. The file is fetched with
// the student's own sign-in on the first tap.
export function AccompanimentPlayer({ id, path }: { id: string; path: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle')
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  // Pauses where it is (the position is kept).
  const pause = useCallback(() => {
    audioRef.current?.pause()
    setState((current) => (current === 'error' ? current : 'idle'))
    releaseSound(id)
  }, [id])

  useEffect(
    () => () => {
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      releaseSound(id)
    },
    [id],
  )

  async function play() {
    claimSound(id, pause)
    // The element is "unlocked" by this tap (needed on iPhone/iPad), then given the real file.
    const audio = audioRef.current ?? new Audio()
    if (!audioRef.current) {
      audioRef.current = audio
      audio.onended = () => {
        audio.currentTime = 0
        setTime(0)
        pause()
      }
      audio.ontimeupdate = () => setTime(audio.currentTime)
      audio.ondurationchange = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    }
    try {
      if (!urlRef.current) {
        setState('loading')
        audio.src = silentSoundUrl()
        void audio.play().catch(() => undefined)
        const blob = await loadSheet(path)
        // Something else (the metronome, another track) was started while this was loading:
        // this one must not start now.
        if (!isActiveSound(id)) {
          audio.pause()
          setState('idle')
          return
        }
        urlRef.current = URL.createObjectURL(blob)
        audio.src = urlRef.current
      }
      await audio.play()
      setState('playing')
    } catch {
      releaseSound(id)
      setState('error')
    }
  }

  function seek(seconds: number) {
    const audio = audioRef.current
    if (!audio) return
    const target = Math.min(Math.max(0, seconds), duration || seconds)
    audio.currentTime = target
    setTime(target)
  }

  const loaded = duration > 0
  const skip = 'min-h-12 rounded-2xl border border-ink/20 bg-white px-3 text-base font-medium'

  return (
    <section aria-label="ליווי" className="flex flex-col gap-2 rounded-2xl bg-sage p-3">
      <h4 className="text-base font-bold">ליווי</h4>
      <Button
        variant={state === 'playing' ? 'outline' : 'primary'}
        disabled={state === 'loading'}
        onClick={() => (state === 'playing' ? pause() : void play())}
      >
        {state === 'playing' ? '⏸ עצירה' : state === 'loading' ? 'טוענים...' : '▶ ניגון הליווי'}
      </Button>
      {loaded && (
        <div className="flex flex-col gap-1" dir="ltr">
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={time}
            aria-label="מקום בליווי"
            onChange={(e) => seek(Number(e.target.value))}
            className="h-8 w-full accent-ink"
          />
          <div className="flex items-center justify-between gap-2">
            <button type="button" className={skip} aria-label="10 שניות אחורה" onClick={() => seek(time - SKIP_SECONDS)}>
              ⏪ 10
            </button>
            <p className="text-sm tabular-nums" aria-live="off" data-testid="accompaniment-time">
              {formatClock(time * 1000)} / {formatClock(duration * 1000)}
            </p>
            <button type="button" className={skip} aria-label="10 שניות קדימה" onClick={() => seek(time + SKIP_SECONDS)}>
              10 ⏩
            </button>
          </div>
        </div>
      )}
      {state === 'error' && <p role="alert" className="text-sm">לא הצלחנו לנגן את הקובץ. אפשר לנסות שוב.</p>}
    </section>
  )
}
