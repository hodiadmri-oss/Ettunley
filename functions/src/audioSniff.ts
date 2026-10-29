// The browser says what type a recording is, but that is only a claim. This looks at the first
// bytes of the file and accepts only what real audio files start with (the formats browsers
// record in: WebM, Ogg, MP4/M4A/3GP, MP3/AAC, WAV).
export function looksLikeAudio(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  const at = (offset: number, text: string) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0))
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true // WebM
  if (at(0, 'OggS')) return true
  if (at(4, 'ftyp')) return true // MP4, M4A, 3GP
  if (at(0, 'ID3')) return true // MP3 with a tag
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true // MP3 / AAC frame
  if (at(0, 'RIFF') && at(8, 'WAVE')) return true
  return false
}
