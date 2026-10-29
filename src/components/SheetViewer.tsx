import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { openPdf, type PdfPages } from '@/lib/pdfPages'
import { loadSheet } from '@/lib/sheetFiles'

type Loaded = {
  /** Where "open in a new window" goes: the picture itself, or the PDF. */
  href: string
  kind: 'image' | 'pdf'
  /** The small picture. */
  thumb: string
  pdf?: PdfPages
}

const THUMB_WIDTH = 600

// Sheet music: a small picture under the item (also for a PDF: its first page), loaded when it
// comes into view. Tapping it opens a large view (tap again to zoom in and scroll; a PDF shows
// all its pages) with a button to open it in a new window instead (the browser's own zoom).
// The file is fetched with the person's own sign-in; we never navigate to a storage address.
export function SheetViewer({ path }: { path: string }) {
  const holder = useRef<HTMLDivElement>(null)
  const [file, setFile] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [wanted, setWanted] = useState(false)
  const [big, setBig] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [pages, setPages] = useState<string[]>([])

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
    const urls: string[] = []
    let pdf: PdfPages | undefined
    setFailed(false)
    void (async () => {
      try {
        const blob = await loadSheet(path)
        if (blob.type.startsWith('image/')) {
          const href = URL.createObjectURL(blob)
          urls.push(href)
          if (!cancelled) setFile({ href, kind: 'image', thumb: href })
          return
        }
        const href = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
        urls.push(href)
        pdf = await openPdf(blob)
        const thumb = await pdf.render(1, THUMB_WIDTH)
        urls.push(thumb)
        if (!cancelled) setFile({ href, kind: 'pdf', thumb, pdf })
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      urls.forEach((url) => URL.revokeObjectURL(url))
      pdf?.destroy()
    }
  }, [path, wanted])

  // The full pages of a PDF are drawn when the large view is opened.
  useEffect(() => {
    if (!big || file?.kind !== 'pdf' || !file.pdf) return
    const pdf = file.pdf
    let cancelled = false
    const urls: string[] = []
    void (async () => {
      try {
        for (let page = 1; page <= pdf.pageCount && !cancelled; page++) {
          const url = await pdf.render(page, 1000)
          urls.push(url)
          if (cancelled) break
          setPages((current) => [...current, url])
        }
      } catch {
        // the pages drawn so far stay; the new-window link opens the whole file
      }
    })()
    return () => {
      cancelled = true
      urls.forEach((url) => URL.revokeObjectURL(url))
      setPages([])
    }
  }, [big, file])

  useEffect(() => {
    if (!big) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBig(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [big])

  const link = 'inline-flex min-h-12 items-center justify-center rounded-2xl bg-peach px-5 py-3 text-base font-medium'
  const zoomClass = zoomed ? 'w-[250%] max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain'

  return (
    <div ref={holder} className="flex flex-col gap-2">
      {failed && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm">לא הצלחנו להציג את התווים.</p>
          <Button variant="soft" onClick={() => setWanted(false)}>
            לנסות שוב
          </Button>
        </div>
      )}
      {!file && !failed && <p className="rounded-2xl bg-cream px-3 py-6 text-center text-sm text-ink/60">טוענים את התווים...</p>}
      {file && (
        <>
          <button type="button" onClick={() => setBig(true)} aria-label="הגדלת התווים" className="block w-full">
            <img
              src={file.thumb}
              alt={file.kind === 'pdf' ? 'תווים (עמוד 1)' : 'תווים'}
              className="max-h-48 w-full rounded-2xl border border-ink/10 bg-white object-contain"
            />
          </button>
          <p className="text-center text-xs text-ink/60">
            {file.kind === 'pdf' && file.pdf ? `PDF, ${file.pdf.pageCount}${file.pdf.truncated ? '+' : ''} עמודים. ` : ''}
            לחיצה על התמונה מגדילה
          </p>
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
                <div className="mx-auto flex flex-col gap-3">
                  {file.kind === 'image' ? (
                    <img src={file.href} alt="תווים בגדול" onClick={() => setZoomed((z) => !z)} className={`mx-auto rounded-lg bg-white ${zoomClass}`} />
                  ) : (
                    pages.map((url, index) => (
                      <img
                        key={url}
                        src={url}
                        alt={`עמוד ${index + 1}`}
                        onClick={() => setZoomed((z) => !z)}
                        className={`mx-auto rounded-lg bg-white ${zoomed ? 'w-[250%] max-w-none cursor-zoom-out' : 'w-full max-w-3xl cursor-zoom-in'}`}
                      />
                    ))
                  )}
                  {file.kind === 'pdf' && file.pdf && pages.length < file.pdf.pageCount && (
                    <p className="text-center text-sm text-white/80">טוענים את העמודים...</p>
                  )}
                </div>
              </div>
              <p className="p-2 text-center text-xs text-white/80">לחיצה על התמונה מקרבת ומרחיקה</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
