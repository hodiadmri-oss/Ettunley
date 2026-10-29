import { AccompanimentPlayer } from '@/components/AccompanimentPlayer'
import { ItemStatus } from '@/components/ItemStatus'
import { Metronome, useMetronome } from '@/components/Metronome'
import { Recorder } from '@/components/Recorder'
import { RecordingPlayer } from '@/components/RecordingPlayer'
import { SheetViewer } from '@/components/SheetViewer'
import { YoutubeLink } from '@/components/YoutubeLink'
import type { Item } from '@/lib/assignments'

// One item as the student sees it: the teacher's tips, sheet music, YouTube, backing track,
// metronome, the recording and the student's own status. In the teacher's preview nothing can
// be changed or recorded, but the student's recording can be heard.
export function PracticeItem({
  item,
  assignmentId,
  studentUid,
  canRecord,
  preview,
}: {
  item: Item
  assignmentId: string
  studentUid: string
  canRecord: boolean
  preview: boolean
}) {
  const metronome = useMetronome(`metronome-${item.id}`, item.metronomeBpm)
  return (
    <article className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
      <h2 className="text-xl font-bold">{item.title}</h2>
      {item.notes && <p className="whitespace-pre-wrap text-base">{item.notes}</p>}
      {item.sheetPath && <SheetViewer path={item.sheetPath} />}
      {item.youtubeUrl && <YoutubeLink url={item.youtubeUrl} />}
      {item.accompanimentPath && <AccompanimentPlayer id={`accompaniment-${item.id}`} path={item.accompanimentPath} />}
      <Metronome control={metronome} teacherBpm={item.metronomeBpm} />
      {preview ? (
        item.recording && (
          <section aria-label="הקלטה" className="flex flex-col gap-2 rounded-2xl bg-peach/60 p-3">
            <h4 className="text-base font-bold">הקלטה של התלמיד/ה</h4>
            <RecordingPlayer path={item.recording.path} label="האזנה להקלטה" />
          </section>
        )
      ) : (
        <Recorder
          assignmentId={assignmentId}
          itemId={item.id}
          studentUid={studentUid}
          canRecord={canRecord}
          existing={item.recording}
          metronome={metronome}
        />
      )}
      <ItemStatus assignmentId={assignmentId} itemId={item.id} initial={item.status} readOnly={preview} />
    </article>
  )
}
