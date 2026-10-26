import { useEffect, useState } from 'react'
import { ErrorNote } from '@/components/ErrorNote'
import { Button } from '@/components/ui/button'
import { loadSheet } from '@/lib/sheetFiles'

// Sheet music is fetched only when someone taps "show". An image is shown through
// <img>; a PDF is opened as a local blob in a new tab. We never navigate to a storage URL.
export function SheetViewer({ path }: { path: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [image, setImage] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image)
    },
    [image],
  )

  async function show() {
    setState('loading')
    try {
      const blob = await loadSheet(path)
      if (blob.type.startsWith('image/')) {
        setImage(URL.createObjectURL(blob))
        setState('idle')
      } else {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
        window.open(url, '_blank', 'noopener')
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        setState('idle')
      }
    } catch {
      setState('error')
    }
  }

  if (image) {
    return (
      <div className="flex flex-col gap-2">
        <img src={image} alt="תווים" className="w-full rounded-2xl border border-ink/10 bg-white" />
        <button type="button" className="self-start text-sm underline" onClick={() => setImage(null)}>
          הסתרה
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="soft" disabled={state === 'loading'} onClick={() => void show()}>
        {state === 'loading' ? 'רגע...' : 'הצגת התווים'}
      </Button>
      <ErrorNote message={state === 'error' ? 'לא הצלחנו לפתוח את הקובץ. אפשר לנסות שוב.' : null} />
    </div>
  )
}
