// Only one sound plays at a time: the metronome and the backing track never play together,
// and starting one on another item stops the first. Everything stops when the app is hidden
// (the same moment the practice timer pauses).

let current: { id: string; stop: () => void } | null = null

export function claimSound(id: string, stop: () => void): void {
  if (current && current.id !== id) current.stop()
  current = { id, stop }
}

// True while this sound is the one that was last started (nobody has taken over since).
export function isActiveSound(id: string): boolean {
  return current?.id === id
}

export function releaseSound(id: string): void {
  if (current?.id === id) current = null
}

export function stopAllSound(): void {
  const active = current
  current = null
  active?.stop()
}

// While a recording is being made the backing track cannot be played (the metronome can).
let recording = false
const listeners = new Set<() => void>()

export function setRecordingActive(value: boolean): void {
  recording = value
  listeners.forEach((listener) => listener())
}

export function subscribeRecording(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isRecordingActive(): boolean {
  return recording
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopAllSound()
  })
}

// A short silent sound as a data-free blob (the page's security policy allows blob: media).
let silentUrl: string | null = null
export function silentSoundUrl(): string {
  if (silentUrl) return silentUrl
  const sampleRate = 8000
  const samples = sampleRate / 4
  const buffer = new ArrayBuffer(44 + samples)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  text(36, 'data')
  view.setUint32(40, samples, true)
  new Uint8Array(buffer, 44).fill(128) // 8-bit silence
  silentUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
  return silentUrl
}

// iPhone and iPad: sound from a web page is muted by the silent switch unless the page
// is playing "media". This asks for that (Safari 17+) and, as a fallback, keeps a silent
// sound playing while the metronome runs. Must be called from a tap.
export function allowSoundOnSilentSwitch(): HTMLAudioElement | null {
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
  } catch {
    // not supported
  }
  try {
    const element = new Audio(silentSoundUrl())
    element.loop = true
    void element.play().catch(() => undefined)
    return element
  } catch {
    return null
  }
}
