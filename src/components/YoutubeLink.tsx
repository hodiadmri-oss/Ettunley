import { youtubeUrlFromId, youtubeVideoId } from '@/lib/youtube'

// A plain link that opens YouTube; no embedded player (no third-party frame for children).
export function YoutubeLink({ url }: { url: string }) {
  const id = youtubeVideoId(url)
  if (!id) return null
  return (
    <a
      href={youtubeUrlFromId(id)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-sky px-6 py-3 text-lg font-medium"
    >
      פתיחה ביוטיוב
    </a>
  )
}
