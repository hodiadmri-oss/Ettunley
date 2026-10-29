import { useCallback, useEffect, useRef, useState } from 'react'
import { claimSound, isActiveSound, releaseSound } from '@/lib/sound'
import { formatClock } from '@/lib/practiceTimer'
import { loadSheet } from '@/lib/sheetFiles'

const SKIP_SECONDS = 10

// The backing track as a small player: a play triangle, a bar with a dot to move to any
// point, the time, and 10 seconds back or forward. No tempo change and no looping.
// The file is fetched with the student's own sign-in when the player comes into view, so the
// play button works at once when it is tapped (phones only start sound from a tap).
export function AccompanimentPlayer({ id, path }: { id: string; path: string }) {
  const holder = useRef<HTMLElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [wanted, setWanted] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Pauses where it is (the position is kept).
  const pause = useCallback(() => {
    audioRef.current?.pause()
    setPlaying(false)
    releaseSound(id)
  }, [id])

  useEffect(() => {
    const node = holder.current
    if (!node || wanted) return
    if (typeof IntersectionObserver === 'undefined') {
      setWanted(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setWanted(true)
        observer.disconnect()
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [wanted])

  useEffect(() => {
    if (!wanted) return
    let cancelled = false
    let url: string | null = null
    setFailed(null)
    setReady(false)
    loadSheet(path)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        const audio = new Audio()
        audio.preload = 'auto'
        audio.onended = () => {
          audio.currentTime = 0
          setTime(0)
          setPlaying(false)
          releaseSound(id)
        }
        audio.ontimeupdate = () => setTime(audio.currentTime)
        audio.ondurationchange = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
        audio.onerror = () => setFailed('הקובץ לא מתנגן במכשיר הזה.')
        audio.src = url
        audioRef.current = audio
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setFailed('לא הצלחנו לטעון את הליווי.')
      })
    return () => {
      cancelled = true
      audioRef.current?.pause()
      audioRef.current = null
      if (url) URL.revokeObjectURL(url)
      releaseSound(id)
      setPlaying(false)
    }
  }, [path, wanted, id])

  async function play() {
    const audio = audioRef.current
    if (!audio) return
    claimSound(id, pause)
    // Something else may have been started meanwhile: then this must not start.
    if (!isActiveSound(id)) return
    try {
      await audio.play()
      setPlaying(true)
    } catch (error) {
      releaseSound(id)
      setFailed(`לא הצלחנו לנגן (${(error as Error).name || 'שגיאה'}).`)
    }
  }

  function seek(seconds: number) {
    const audio = audioRef.current
    if (!audio) return
    const target = Math.min(Math.max(0, seconds), duration || seconds)
    audio.currentTime = target
    setTime(target)
  }

  const small = 'rounded-xl px-2 py-2 text-sm underline'

  return (
    <section ref={holder} aria-label="ליווי" className="flex flex-col gap-1 rounded-2xl bg-sage p-3">
      <h4 className="text-base font-bold">ליווי</h4>
      <div className="flex items-center gap-3" dir="ltr">
        <button
          type="button"
          aria-label={playing ? 'עצירת הליווי' : 'ניגון הליווי'}
          disabled={!ready}
          onClick={() => (playing ? pause() : void play())}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-xl text-white disabled:opacity-40"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(time, duration || 1)}
          disabled={!ready || duration === 0}
          aria-label="מקום בליווי"
          onChange={(e) => seek(Number(e.target.value))}
          className="h-10 min-w-0 flex-1 accent-ink"
        />
      </div>
      <div className="flex items-center justify-between gap-2" dir="ltr">
        <button type="button" className={small} aria-label="10 שניות אחורה" disabled={!ready} onClick={() => seek(time - SKIP_SECONDS)}>
          ⏪ 10
        </button>
        <p className="text-sm tabular-nums" aria-live="off" data-testid="accompaniment-time">
          {ready ? `${formatClock(time * 1000)} / ${formatClock(duration * 1000)}` : 'טוענים...'}
        </p>
        <button type="button" className={small} aria-label="10 שניות קדימה" disabled={!ready} onClick={() => seek(time + SKIP_SECONDS)}>
          10 ⏩
        </button>
      </div>
      {failed && <p role="alert" className="text-sm">{failed}</p>}
    </section>
  )
}
