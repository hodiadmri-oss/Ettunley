import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { loadSheet } from '@/lib/sheetFiles'

type Loaded = { href: string; kind: 'image' | 'pdf' }

// Sheet music: a small picture under the item, loaded when it comes into view. Tapping the
// picture opens a large view (tap again to zoom in and scroll), with a button to open it in a
// new window instead (the browser's own zoom). A PDF is a button that opens it in a new window.
// The file is fetched with the person's own sign-in; we never navigate to a storage address.
export function SheetViewer({ path }: { path: string }) {
  const holder = useRef<HTMLDivElement>(null)
  const [file, setFile] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [wanted, setWanted] = useState(false)
  const [big, setBig] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  // Start loading when the picture's place is on screen.
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
    let created: string | null = null
    setFailed(false)
    loadSheet(path)
      .then((blob) => {
        if (cancelled) return
        const image = blob.type.startsWith('image/')
        created = URL.createObjectURL(image ? blob : new Blob([blob], { type: 'application/pdf' }))
        setFile({ href: created, kind: image ? 'image' : 'pdf' })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [path, wanted])

  useEffect(() => {
    if (!big) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBig(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [big])

  const link = 'inline-flex min-h-12 items-center justify-center rounded-2xl bg-peach px-5 py-3 text-base font-medium'

  return (
    <div ref={holder} className="flex flex-col gap-2">
      {failed && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm">לא הצלחנו לפתוח את התווים.</p>
          <Button variant="soft" onClick={() => setWanted(false)}>
            לנסות שוב
          </Button>
        </div>
      )}
      {!file && !failed && <p className="rounded-2xl bg-cream px-3 py-6 text-center text-sm text-ink/60">טוענים את התווים...</p>}
      {file?.kind === 'pdf' && (
        <a href={file.href} target="_blank" rel="noopener noreferrer" className={link}>
          פתיחת התווים (PDF) בחלון חדש
        </a>
      )}
      {file?.kind === 'image' && (
        <>
          <button type="button" onClick={() => setBig(true)} aria-label="הגדלת התווים" className="block w-full">
            <img src={file.href} alt="תווים" className="max-h-48 w-full rounded-2xl border border-ink/10 bg-white object-contain" />
          </button>
          <p className="text-center text-xs text-ink/60">לחיצה על התמונה מגדילה</p>
          {big && (
            <div role="dialog" aria-modal="true" aria-label="התווים בגדול" className="fixed inset-0 z-50 flex flex-col bg-black/90">
              <div className="flex items-center justify-between gap-2 p-3">
                <Button variant="outline" onClick={() => setBig(false)}>
                  סגירה
                </Button>
                <a href={file.href} target="_blank" rel="noopener noreferrer" className={link}>
                  פתיחה בחלון חדש
                </a>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <img
                  src={file.href}
                  alt="תווים בגדול"
                  onClick={() => setZoomed((z) => !z)}
                  className={`mx-auto rounded-lg bg-white ${zoomed ? 'w-[250%] max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain'}`}
                />
              </div>
              <p className="p-2 text-center text-xs text-white/80">לחיצה על התמונה מקרבת ומרחיקה</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
