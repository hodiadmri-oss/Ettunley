import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { claimSound, releaseSound, silentSoundUrl } from '@/lib/sound'
import { loadSheet } from '@/lib/sheetFiles'

// The backing track: play and stop, nothing else. The file is fetched with the student's own
// sign-in on the first tap.
export function AccompanimentPlayer({ id, path }: { id: string; path: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
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
    claimSound(id, stop)
    // The element is "unlocked" by this tap (needed on iPhone/iPad), then given the real file.
    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio
    audio.onended = () => stop()
    try {
      if (!urlRef.current) {
        setState('loading')
        audio.src = silentSoundUrl()
        void audio.play().catch(() => undefined)
        urlRef.current = URL.createObjectURL(await loadSheet(path))
      }
      audio.src = urlRef.current
      await audio.play()
      setState('playing')
    } catch {
      releaseSound(id)
      setState('error')
    }
  }

  return (
    <section aria-label="ליווי" className="flex flex-col gap-2 rounded-2xl bg-sage p-3">
      <h4 className="text-base font-bold">ליווי</h4>
      <Button
        variant={state === 'playing' ? 'outline' : 'primary'}
        disabled={state === 'loading'}
        onClick={() => (state === 'playing' ? stop() : void play())}
      >
        {state === 'playing' ? '■ עצירה' : state === 'loading' ? 'טוענים...' : '▶ ניגון הליווי'}
      </Button>
      {state === 'error' && <p role="alert" className="text-sm">לא הצלחנו לנגן את הקובץ. אפשר לנסות שוב.</p>}
    </section>
  )
}
