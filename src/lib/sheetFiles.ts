import { deleteObject, getBlob, getMetadata, ref, uploadBytes } from 'firebase/storage'
import { storage } from '@/lib/firebase'

// Sheet music: images or PDF, up to 20 MB (the same limits as the storage rules).
export const MAX_SHEET_BYTES = 20 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']

export type SheetProblem = 'type' | 'size'

// Backing tracks: mp3 only, up to 20 MB (some systems call an mp3 "audio/mp3").
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3']

export function checkAudioFile(file: File): SheetProblem | null {
  if (!ALLOWED_AUDIO_TYPES.includes(file.type)) return 'type'
  if (file.size > MAX_SHEET_BYTES) return 'size'
  return null
}

export function audioProblemMessage(problem: SheetProblem): string {
  return problem === 'type' ? 'אפשר להעלות קובץ mp3 בלבד.' : 'הקובץ גדול מדי. אפשר עד 20MB.'
}

export function checkSheetFile(file: File): SheetProblem | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'type'
  if (file.size > MAX_SHEET_BYTES) return 'size'
  return null
}

export function sheetProblemMessage(problem: SheetProblem): string {
  return problem === 'type'
    ? 'אפשר להעלות תמונה (JPG, PNG) או קובץ PDF בלבד.'
    : 'הקובץ גדול מדי. אפשר עד 20MB.'
}

// Files live in the teacher's own folder under a random name.
export async function uploadSheet(teacherUid: string, file: File): Promise<string> {
  const path = `sheet-music/${teacherUid}/${crypto.randomUUID()}`
  // The original name is kept in the file's data so the owner can recognise it in /admin.
  const contentType = file.type === 'audio/mp3' ? 'audio/mpeg' : file.type
  await uploadBytes(ref(storage, path), file, { contentType, customMetadata: { name: file.name.slice(0, 100) } })
  return path
}

// Best effort: a leftover file is harmless (it stays private), so failures are ignored.
export async function deleteSheet(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path))
  } catch {
    // ignore
  }
}

// Never getDownloadURL(): that link works for anyone who has it. The file is fetched
// with the person's own sign-in, so the storage rules decide who may see it.
export async function loadSheet(path: string): Promise<Blob> {
  return getBlob(ref(storage, path))
}

export type SheetCache = Map<string, { blob: Blob; name: string }>

// A private copy of a file, in the teacher's own folder (used for templates, so that every
// assignment and template owns its files). Returns the new path. When many copies of the
// same file are made in a row, pass the same `cache` so the file is downloaded only once.
export async function copySheet(teacherUid: string, fromPath: string, cache?: SheetCache): Promise<string> {
  let source = cache?.get(fromPath)
  if (!source) {
    const [blob, meta] = await Promise.all([loadSheet(fromPath), getMetadata(ref(storage, fromPath))])
    source = { blob, name: meta.customMetadata?.name ?? '' }
    cache?.set(fromPath, source)
  }
  const path = `sheet-music/${teacherUid}/${crypto.randomUUID()}`
  await uploadBytes(ref(storage, path), source.blob, {
    contentType: source.blob.type,
    ...(source.name ? { customMetadata: { name: source.name } } : {}),
  })
  return path
}
