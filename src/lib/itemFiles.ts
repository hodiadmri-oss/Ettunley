import type { ItemDraft, ItemFiles } from '@/lib/assignments'
import { copySheet, deleteSheet, uploadSheet, type SheetCache } from '@/lib/sheetFiles'

// Gets every item's files ready for saving: new files are uploaded, files of a template
// are copied (so each assignment owns its files). With `copyExisting` the files an item
// already has are copied too (used when a template is made from an assignment).
// If anything fails, the files created so far are removed again and the error is rethrown.
export async function prepareItemFiles(
  teacherUid: string,
  items: ItemDraft[],
  options: { copyExisting?: boolean; cache?: SheetCache } = {},
): Promise<ItemFiles[]> {
  const created: string[] = []
  const track = (path: string) => {
    created.push(path)
    return path
  }
  const pick = async (file: File | undefined, copyFrom: string | undefined, existing: string | undefined) => {
    if (file) return track(await uploadSheet(teacherUid, file))
    const source = copyFrom ?? (options.copyExisting ? existing : undefined)
    return source ? track(await copySheet(teacherUid, source, options.cache)) : undefined
  }
  try {
    const out: ItemFiles[] = []
    for (const item of items) {
      out.push({
        sheet: await pick(item.newSheet, item.copySheetFrom, item.sheetPath),
        accompaniment: await pick(item.newAccompaniment, item.copyAccompanimentFrom, item.accompanimentPath),
      })
    }
    return out
  } catch (error) {
    await Promise.all(created.map(deleteSheet))
    throw error
  }
}

// Every path the files of these items would use (for cleaning up).
export function createdPaths(files: ItemFiles[]): string[] {
  return files.flatMap((f) => [f.sheet, f.accompaniment]).filter((p): p is string => Boolean(p))
}
