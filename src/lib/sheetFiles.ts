import { deleteObject, getBlob, ref, uploadBytes } from 'firebase/storage'
import { storage } from '@/lib/firebase'

// Sheet music: images or PDF, up to 20 MB (the same limits as the storage rules).
export const MAX_SHEET_BYTES = 20 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']

export type SheetProblem = 'type' | 'size'

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
  await uploadBytes(ref(storage, path), file, { contentType: file.type })
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
