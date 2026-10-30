import { useEffect, useState } from 'react'
import { listComments, markRepliesRead, type Comment } from '@/lib/comments'

// The teacher's short replies to the student's recording of one item. An unread one has a
// "חדש" badge; it counts as read once it has been on the screen (the teacher's preview never marks).
export function ItemReplies({ assignmentId, itemId, preview }: { assignmentId: string; itemId: string; preview: boolean }) {
  const [replies, setReplies] = useState<Comment[]>([])
  // The ones that were new when the screen opened keep their badge until the student leaves.
  const [wereNew, setWereNew] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listComments(assignmentId, itemId)
        if (cancelled) return
        setReplies(list)
        const unread = list.filter((c) => c.readAt === null).map((c) => c.id)
        setWereNew(new Set(unread))
        if (unread.length > 0 && !preview) await markRepliesRead(assignmentId, itemId, unread)
      } catch {
        // no replies shown; the rest of the item still works
      }
    })()
    return () => {
      cancelled = true
    }
  }, [assignmentId, itemId, preview])

  if (replies.length === 0) return null
  return (
    <section aria-label="תגובות המורה" className="flex flex-col gap-2 rounded-2xl bg-sky p-3">
      <h4 className="text-base font-bold">תגובה מהמורה</h4>
      {replies.map((c) => (
        <p key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-base">
          {wereNew.has(c.id) && (
            <span className="rounded-full bg-ink px-2 py-0.5 text-sm font-medium text-white" data-testid="new-reply">
              חדש
            </span>
          )}
          <span className="whitespace-pre-wrap">{c.text}</span>
        </p>
      ))}
    </section>
  )
}
