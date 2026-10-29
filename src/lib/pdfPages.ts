// Sheet music in a PDF is turned into pictures (page by page) so it looks like any other
// sheet music: a small picture first, the full pages when opened. pdf.js is loaded only
// when a PDF is actually shown, and it runs from our own files (no third-party code).
import type { PDFDocumentProxy } from 'pdfjs-dist'

const MAX_PAGES = 30

let library: Promise<typeof import('pdfjs-dist')> | null = null

function loadLibrary() {
  library ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    return pdfjs
  })
  return library
}

export interface PdfPages {
  /** Pages that can be shown (at most 30). */
  pageCount: number
  /** True when the file has more pages than are shown here. */
  truncated: boolean
  /** One page as a picture (an object URL) that is `width` CSS pixels wide. Release it with URL.revokeObjectURL. */
  render: (page: number, width: number) => Promise<string>
  destroy: () => void
}

export async function openPdf(blob: Blob): Promise<PdfPages> {
  const pdfjs = await loadLibrary()
  const data = new Uint8Array(await blob.arrayBuffer())
  // No scripts, no eval and no fonts loaded through the page: the glyphs are drawn directly.
  const document: PDFDocumentProxy = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    enableXfa: false,
  }).promise
  return {
    pageCount: Math.min(document.numPages, MAX_PAGES),
    truncated: document.numPages > MAX_PAGES,
    async render(pageNumber, width) {
      const page = await document.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: (width * ratio) / base.width })
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no canvas')
      await page.render({ canvasContext: context, viewport }).promise
      page.cleanup()
      return new Promise<string>((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(URL.createObjectURL(result)) : reject(new Error('no picture'))), 'image/png')
      })
    },
    destroy() {
      void document.destroy()
    },
  }
}
