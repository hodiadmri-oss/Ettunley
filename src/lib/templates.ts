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
import { db } from '@/lib/firebase'
import { createAssignment, MAX_ITEMS, type AssignmentDraft, type ItemDraft } from '@/lib/assignments'
import { copySheet, deleteSheet, uploadSheet, type SheetCache } from '@/lib/sheetFiles'
import { normalizeYoutubeUrl } from '@/lib/youtube'

const MAX_TEMPLATES_LISTED = 50

export interface Template {
  id: string
  title: string
  description: string
  dailyGoalMinutes: number
  createdAt: number
}

export interface TemplateContent {
  title: string
  description: string
  dailyGoalMinutes: number
  items: ItemDraft[]
}

export async function listTemplates(teacherId: string): Promise<Template[]> {
  const snap = await getDocs(
    query(collection(db, 'templates'), where('teacherId', '==', teacherId), limit(MAX_TEMPLATES_LISTED)),
  )
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        title: String(x.title ?? ''),
        description: String(x.description ?? ''),
        dailyGoalMinutes: Number(x.dailyGoalMinutes ?? 0),
        createdAt: (x.createdAt as Timestamp | undefined)?.toMillis() ?? 0,
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

// The items come back as drafts whose sheet music is only *referenced* (copySheetFrom):
// the file is copied when the new assignment is saved, so every assignment owns its files.
export async function loadTemplate(id: string, forEdit = false): Promise<TemplateContent | null> {
  const snap = await getDoc(doc(db, 'templates', id))
  if (!snap.exists()) return null
  const x = snap.data()
  const items = await getDocs(query(collection(db, 'templates', id, 'items'), orderBy('position'), limit(MAX_ITEMS)))
  return {
    title: String(x.title ?? ''),
    description: String(x.description ?? ''),
    dailyGoalMinutes: Number(x.dailyGoalMinutes ?? 15),
    items: items.docs.map((d) => {
      const i = d.data()
      return {
        title: String(i.title ?? ''),
        notes: String(i.notes ?? ''),
        youtube: typeof i.youtubeUrl === 'string' ? i.youtubeUrl : '',
        bpm: typeof i.metronomeBpm === 'number' ? String(i.metronomeBpm) : '',
        // Editing a template keeps its own files; a new assignment copies them.
        ...(typeof i.sheetPath === 'string' ? (forEdit ? { sheetPath: i.sheetPath } : { copySheetFrom: i.sheetPath }) : {}),
        hasRecording: false,
      }
    }),
  }
}

// Saves what is on screen as a template. Sheet music is copied, so changing or removing
// the file in the assignment later does not touch the template.
export async function saveAsTemplate(teacherId: string, draft: AssignmentDraft): Promise<void> {
  const copies: (string | undefined)[] = []
  try {
    for (const item of draft.items) {
      const source = item.sheetPath ?? item.copySheetFrom
      copies.push(
        item.newSheet ? await uploadSheet(teacherId, item.newSheet) : source ? await copySheet(teacherId, source) : undefined,
      )
    }
    const description = draft.description.trim()
    const ref = await addDoc(collection(db, 'templates'), {
      teacherId,
      title: draft.title.trim(),
      dailyGoalMinutes: draft.dailyGoalMinutes,
      ...(description ? { description } : {}),
      createdAt: serverTimestamp(),
    })
    const batch = writeBatch(db)
    draft.items.forEach((item, position) => {
      const youtube = item.youtube.trim() ? normalizeYoutubeUrl(item.youtube) : null
      const fields: Record<string, unknown> = { position, title: item.title.trim() }
      if (item.notes.trim()) fields.notes = item.notes.trim()
      if (copies[position]) fields.sheetPath = copies[position]
      if (youtube) fields.youtubeUrl = youtube
      if (item.bpm.trim()) fields.metronomeBpm = Number(item.bpm)
      batch.set(doc(collection(db, 'templates', ref.id, 'items')), fields)
    })
    await batch.commit()
  } catch (error) {
    await Promise.all(copies.filter((p): p is string => Boolean(p)).map(deleteSheet))
    throw error
  }
}

// Items first, then the template itself, then the template's own copies of the files.
export async function deleteTemplate(id: string): Promise<void> {
  const items = await getDocs(query(collection(db, 'templates', id, 'items'), limit(MAX_ITEMS)))
  const paths = items.docs.map((d) => d.data().sheetPath).filter((p): p is string => typeof p === 'string')
  const batch = writeBatch(db)
  items.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  const last = writeBatch(db)
  last.delete(doc(db, 'templates', id))
  await last.commit()
  await Promise.all(paths.map(deleteSheet))
}

// Editing a template: the template's fields are updated and its items are replaced.
// `uploaded[i]` is the path of a newly uploaded sheet for item i; files that are no longer
// used are removed afterwards.
export async function updateTemplate(id: string, draft: AssignmentDraft, uploaded: (string | undefined)[]): Promise<void> {
  const old = await getDocs(query(collection(db, 'templates', id, 'items'), limit(MAX_ITEMS)))
  const oldPaths = old.docs.map((d) => d.data().sheetPath).filter((p): p is string => typeof p === 'string')
  const description = draft.description.trim()
  const head = writeBatch(db)
  head.update(doc(db, 'templates', id), {
    title: draft.title.trim(),
    dailyGoalMinutes: draft.dailyGoalMinutes,
    description: description || deleteField(),
  })
  await head.commit()

  const keptPaths: string[] = []
  const batch = writeBatch(db)
  old.docs.forEach((d) => batch.delete(d.ref))
  draft.items.forEach((item, position) => {
    const youtube = item.youtube.trim() ? normalizeYoutubeUrl(item.youtube) : null
    const sheet = uploaded[position] ?? item.sheetPath
    const fields: Record<string, unknown> = { position, title: item.title.trim() }
    if (item.notes.trim()) fields.notes = item.notes.trim()
    if (sheet) {
      fields.sheetPath = sheet
      keptPaths.push(sheet)
    }
    if (youtube) fields.youtubeUrl = youtube
    if (item.bpm.trim()) fields.metronomeBpm = Number(item.bpm)
    batch.set(doc(collection(db, 'templates', id, 'items')), fields)
  })
  await batch.commit()
  await Promise.all(oldPaths.filter((p) => !keptPaths.includes(p)).map(deleteSheet))
}

export interface AssignResult {
  done: string[]
  failed: string[]
}

// Gives the template to several students at once. Every assignment gets its own copy of
// the sheet music. A student who fails does not stop the others.
export async function assignTemplate(
  teacherUid: string,
  students: { uid: string; name: string }[],
  weekStart: Date,
  content: TemplateContent,
): Promise<AssignResult> {
  const cache: SheetCache = new Map()
  const result: AssignResult = { done: [], failed: [] }
  for (const student of students) {
    const copies: (string | undefined)[] = []
    try {
      for (const item of content.items) {
        copies.push(item.copySheetFrom ? await copySheet(teacherUid, item.copySheetFrom, cache) : undefined)
      }
      const draft: AssignmentDraft = {
        title: content.title,
        description: content.description,
        dailyGoalMinutes: content.dailyGoalMinutes,
        weekStart,
        items: content.items.map((i) => ({ ...i, copySheetFrom: undefined })),
      }
      await createAssignment(teacherUid, student.uid, draft, copies)
      result.done.push(student.name)
    } catch {
      await Promise.all(copies.filter((p): p is string => Boolean(p)).map(deleteSheet))
      result.failed.push(student.name)
    }
  }
  return result
}
