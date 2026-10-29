import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { normalizeYoutubeUrl } from '@/lib/youtube'

export const MAX_ITEMS = 10
const MAX_ASSIGNMENTS_LISTED = 300

export interface Assignment {
  id: string
  teacherId: string
  studentId: string
  title: string
  description: string
  dailyGoalMinutes: number
  weekStart: Date
}

export interface Item {
  id: string
  position: number
  title: string
  notes: string
  sheetPath?: string
  accompanimentPath?: string
  youtubeUrl?: string
  metronomeBpm?: number
  status: 'working' | 'ready'
  /** The student's recording of this item, if there is one. */
  recording?: { path: string; durationSeconds: number; uploadedAt: number | null }
  hasRecording: boolean
}

// What the teacher edits in the form. `youtube` and `bpm` are the raw texts typed.
export interface ItemDraft {
  id?: string
  title: string
  notes: string
  youtube: string
  bpm: string
  sheetPath?: string
  newSheet?: File
  /** Sheet music of a template: copied when the assignment is saved. */
  copySheetFrom?: string
  accompanimentPath?: string
  newAccompaniment?: File
  copyAccompanimentFrom?: string
  hasRecording: boolean
}

// The storage paths of one item's files, after they were uploaded or copied.
export interface ItemFiles {
  sheet?: string
  accompaniment?: string
}

export interface AssignmentDraft {
  title: string
  description: string
  dailyGoalMinutes: number
  weekStart: Date
  items: ItemDraft[]
}

function toAssignment(id: string, d: Record<string, unknown>): Assignment {
  return {
    id,
    teacherId: String(d.teacherId),
    studentId: String(d.studentId),
    title: String(d.title ?? ''),
    description: String(d.description ?? ''),
    dailyGoalMinutes: Number(d.dailyGoalMinutes ?? 0),
    weekStart: (d.weekStart as Timestamp).toDate(),
  }
}

// A student lists their own assignments; a teacher lists the assignments of ONE of
// their students (the security rules need both filters). Newest week first.
export async function listAssignments(studentId: string, teacherId?: string): Promise<Assignment[]> {
  const filters = [where('studentId', '==', studentId)]
  if (teacherId) filters.push(where('teacherId', '==', teacherId))
  const snap = await getDocs(query(collection(db, 'assignments'), ...filters, limit(MAX_ASSIGNMENTS_LISTED)))
  return snap.docs
    .map((d) => toAssignment(d.id, d.data()))
    .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const snap = await getDoc(doc(db, 'assignments', id))
  return snap.exists() ? toAssignment(snap.id, snap.data()) : null
}

export async function listItems(assignmentId: string): Promise<Item[]> {
  const snap = await getDocs(
    query(collection(db, 'assignments', assignmentId, 'items'), orderBy('position'), limit(MAX_ITEMS)),
  )
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      position: Number(x.position),
      title: String(x.title ?? ''),
      notes: String(x.notes ?? ''),
      sheetPath: typeof x.sheetPath === 'string' ? x.sheetPath : undefined,
      accompanimentPath: typeof x.accompanimentPath === 'string' ? x.accompanimentPath : undefined,
      status: x.status === 'ready' ? 'ready' : 'working',
      youtubeUrl: typeof x.youtubeUrl === 'string' ? x.youtubeUrl : undefined,
      metronomeBpm: typeof x.metronomeBpm === 'number' ? x.metronomeBpm : undefined,
      recording:
        x.recording && typeof x.recording.path === 'string'
          ? {
              path: x.recording.path,
              durationSeconds: Number(x.recording.durationSeconds ?? 0),
              uploadedAt: (x.recording.uploadedAt as Timestamp | undefined)?.toMillis() ?? null,
            }
          : undefined,
      hasRecording: x.recording !== undefined,
    }
  })
}

export function itemToDraft(item: Item): ItemDraft {
  return {
    id: item.id,
    title: item.title,
    notes: item.notes,
    youtube: item.youtubeUrl ?? '',
    bpm: item.metronomeBpm ? String(item.metronomeBpm) : '',
    sheetPath: item.sheetPath,
    accompanimentPath: item.accompanimentPath,
    hasRecording: item.hasRecording,
  }
}

export type DraftProblem = 'title' | 'goal' | 'items' | 'itemTitle' | 'youtube' | 'bpm'

export function draftProblem(draft: AssignmentDraft): DraftProblem | null {
  if (!draft.title.trim()) return 'title'
  if (!Number.isInteger(draft.dailyGoalMinutes) || draft.dailyGoalMinutes < 1 || draft.dailyGoalMinutes > 240) return 'goal'
  if (draft.items.length > MAX_ITEMS) return 'items'
  for (const item of draft.items) {
    if (!item.title.trim()) return 'itemTitle'
    if (item.youtube.trim() && !normalizeYoutubeUrl(item.youtube)) return 'youtube'
    if (item.bpm.trim()) {
      const bpm = Number(item.bpm)
      if (!Number.isInteger(bpm) || bpm < 20 || bpm > 300) return 'bpm'
    }
  }
  return null
}

export function draftProblemMessage(problem: DraftProblem): string {
  switch (problem) {
    case 'title':
      return 'צריך לכתוב כותרת למטלה.'
    case 'goal':
      return 'היעד היומי צריך להיות מספר דקות בין 1 ל-240.'
    case 'items':
      return `אפשר עד ${MAX_ITEMS} פריטים במטלה.`
    case 'itemTitle':
      return 'לכל פריט צריך לכתוב שם.'
    case 'youtube':
      return 'הקישור ליוטיוב לא נראה תקין. אפשר להדביק קישור רגיל מהאתר או מהאפליקציה.'
    case 'bpm':
      return 'המטרונום צריך להיות מספר בין 20 ל-300.'
  }
}

// The stored fields of one item. Optional parts that are empty are left out
// (or removed, when editing).
function itemFields(draft: ItemDraft, position: number, sheetPath: string | undefined, accompanimentPath: string | undefined) {
  const youtube = draft.youtube.trim() ? normalizeYoutubeUrl(draft.youtube) : null
  const bpm = draft.bpm.trim() ? Number(draft.bpm) : null
  return {
    position,
    title: draft.title.trim(),
    notes: draft.notes.trim() || null,
    sheetPath: sheetPath ?? null,
    accompanimentPath: accompanimentPath ?? null,
    youtubeUrl: youtube,
    metronomeBpm: bpm,
  }
}

type Fields = ReturnType<typeof itemFields>

function forCreate(fields: Fields) {
  const out: Record<string, unknown> = { position: fields.position, title: fields.title, status: 'working' }
  if (fields.notes !== null) out.notes = fields.notes
  if (fields.sheetPath !== null) out.sheetPath = fields.sheetPath
  if (fields.accompanimentPath !== null) out.accompanimentPath = fields.accompanimentPath
  if (fields.youtubeUrl !== null) out.youtubeUrl = fields.youtubeUrl
  if (fields.metronomeBpm !== null) out.metronomeBpm = fields.metronomeBpm
  return out
}

function forUpdate(fields: Fields) {
  return {
    position: fields.position,
    title: fields.title,
    notes: fields.notes ?? deleteField(),
    sheetPath: fields.sheetPath ?? deleteField(),
    accompanimentPath: fields.accompanimentPath ?? deleteField(),
    youtubeUrl: fields.youtubeUrl ?? deleteField(),
    metronomeBpm: fields.metronomeBpm ?? deleteField(),
  }
}

function assignmentFields(draft: AssignmentDraft) {
  return {
    title: draft.title.trim(),
    dailyGoalMinutes: draft.dailyGoalMinutes,
    weekStart: Timestamp.fromDate(draft.weekStart),
  }
}

// The assignment is written first, then its items (the item rules look the
// assignment up). Returns the new assignment's id.
export async function createAssignment(
  teacherId: string,
  studentId: string,
  draft: AssignmentDraft,
  uploaded: ItemFiles[],
): Promise<string> {
  const description = draft.description.trim()
  const ref = await addDoc(collection(db, 'assignments'), {
    teacherId,
    studentId,
    ...assignmentFields(draft),
    ...(description ? { description } : {}),
    createdAt: serverTimestamp(),
  })
  await writeItems(ref.id, draft, uploaded, [])
  return ref.id
}

export async function updateAssignment(
  id: string,
  draft: AssignmentDraft,
  uploaded: ItemFiles[],
  existing: Item[],
): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'assignments', id), {
    ...assignmentFields(draft),
    description: draft.description.trim() || deleteField(),
  })
  await batch.commit()
  await writeItems(id, draft, uploaded, existing)
}

// `uploaded[i]` holds the storage paths of the files newly uploaded (or copied) for draft item i.
async function writeItems(assignmentId: string, draft: AssignmentDraft, uploaded: ItemFiles[], existing: Item[]) {
  const batch = writeBatch(db)
  const keep = new Set(draft.items.map((i) => i.id).filter(Boolean))
  for (const old of existing) {
    if (!keep.has(old.id)) batch.delete(doc(db, 'assignments', assignmentId, 'items', old.id))
  }
  draft.items.forEach((item, position) => {
    const fields = itemFields(item, position, uploaded[position]?.sheet ?? item.sheetPath, uploaded[position]?.accompaniment ?? item.accompanimentPath)
    if (item.id) batch.update(doc(db, 'assignments', assignmentId, 'items', item.id), forUpdate(fields))
    else batch.set(doc(collection(db, 'assignments', assignmentId, 'items')), forCreate(fields))
  })
  await batch.commit()
}

// Deleting runs in a Cloud Function (the rules do not allow it from the app).
export async function deleteAssignment(assignmentId: string): Promise<void> {
  await httpsCallable(functions, 'deleteAssignment')({ assignmentId })
}

export async function deleteMyRecording(assignmentId: string, itemId: string): Promise<void> {
  await httpsCallable(functions, 'deleteMyRecording')({ assignmentId, itemId })
}
