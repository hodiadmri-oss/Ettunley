import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { loadSheet } from '@/lib/sheetFiles'

// Listening to a saved recording. It is fetched with the person's own sign-in when they tap
// (never a public link), then shown with the browser's own player.
export function RecordingPlayer({
  path,
  label = 'האזנה להקלטה',
  onPlay,
}: {
  path: string
  label?: string
  /** Called when playing starts (the teacher's "I listened"). */
  onPlay?: () => void
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [url, setUrl] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )

  async function load() {
    setState('loading')
    try {
      setUrl(URL.createObjectURL(await loadSheet(path)))
      setState('idle')
    } catch {
      setState('error')
    }
  }

  if (url) return <audio controls src={url} className="w-full" aria-label="ההקלטה" onPlay={onPlay} />
  return (
    <div className="flex flex-col gap-1">
      <Button variant="soft" disabled={state === 'loading'} onClick={() => void load()}>
        {state === 'loading' ? 'טוענים...' : `▶ ${label}`}
      </Button>
      {state === 'error' && <p role="alert" className="text-sm">לא הצלחנו לפתוח את ההקלטה. אפשר לנסות שוב (ייתכן שהדפדפן לא מנגן את הפורמט הזה).</p>}
    </div>
  )
}
