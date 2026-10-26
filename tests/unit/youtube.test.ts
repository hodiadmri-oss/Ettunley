import { describe, expect, it } from 'vitest'
import { normalizeYoutubeUrl, youtubeVideoId } from '../../src/lib/youtube'

const ID = 'dQw4w9WgXcQ'
const CANON = `https://www.youtube.com/watch?v=${ID}`

describe('youtube links', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=30s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `  https://www.youtube.com/live/${ID}  `,
  ])('reduces %s to the canonical link', (input) => {
    expect(normalizeYoutubeUrl(input)).toBe(CANON)
  })

  it.each([
    '',
    'hello',
    'javascript:alert(1)',
    `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=short',
    `https://www.youtube.com/watch?v=${ID}extra`,
    'https://www.youtube.com/@channel',
  ])('refuses %s', (input) => {
    expect(youtubeVideoId(input)).toBeNull()
    expect(normalizeYoutubeUrl(input)).toBeNull()
  })
})
