import {
  addDoc,
  collection,
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
import { MAX_ITEMS, type AssignmentDraft, type ItemDraft } from '@/lib/assignments'
import { copySheet, deleteSheet, uploadSheet } from '@/lib/sheetFiles'
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
export async function loadTemplate(id: string): Promise<TemplateContent | null> {
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
        copySheetFrom: typeof i.sheetPath === 'string' ? i.sheetPath : undefined,
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
