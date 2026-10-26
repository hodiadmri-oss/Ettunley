// The security rules accept only plain YouTube watch / youtu.be links. Whatever the
// teacher pastes (shorts, embed, share links with extra parameters) is reduced to the
// video id, and the link we store and show is built from that id.

const ID = /^[A-Za-z0-9_-]{11}$/

export function youtubeVideoId(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  let id: string | null = null
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null
  } else if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
    const [, kind, second] = url.pathname.split('/')
    if (kind === 'watch') id = url.searchParams.get('v')
    else if (kind === 'shorts' || kind === 'embed' || kind === 'live') id = second ?? null
  }
  return id !== null && ID.test(id) ? id : null
}

export function youtubeUrlFromId(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

// For the stored value: the canonical link, or null when the text is not a YouTube link.
export function normalizeYoutubeUrl(input: string): string | null {
  const id = youtubeVideoId(input)
  return id ? youtubeUrlFromId(id) : null
}
