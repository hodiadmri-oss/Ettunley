import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { createEnv, ids, seed } from './helpers'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await createEnv()
})
afterAll(async () => {
  await env.cleanup()
})
beforeEach(async () => {
  await seed(env)
  // Existing files, as they would be after normal use.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const storage = ctx.storage()
    await storage.ref('sheet-music/teacherA/etude.pdf').put(bytes(1000), { contentType: 'application/pdf' })
    await storage.ref('recordings/adultA/a1/i1').put(bytes(1000), { contentType: 'audio/webm' })
    await storage.ref('recordings/minorA/a2/i1').put(bytes(1000), { contentType: 'audio/webm' })
    await storage.ref('recordings/removedStudent/aR/i1').put(bytes(1000), { contentType: 'audio/webm' })
    await storage.ref('recordings/pendingStudent/aP/i1').put(bytes(1000), { contentType: 'audio/webm' })
  })
})

const bytes = (size: number) => new Uint8Array(size)
const MB = 1024 * 1024
const as = (uid: string) => env.authenticatedContext(uid).storage()
const anonymous = () => env.unauthenticatedContext().storage()

describe('sheet music: sheet-music/{teacherId}/{fileId}', () => {
  const upload = (uid: string, path: string, size = 1000, contentType = 'application/pdf') =>
    as(uid).ref(path).put(bytes(size), { contentType })

  it('an approved teacher uploads PDF, image and mp3 into their own folder', async () => {
    await assertSucceeds(upload(ids.teacherA, 'sheet-music/teacherA/new.pdf'))
    await assertSucceeds(upload(ids.teacherA, 'sheet-music/teacherA/new.png', 1000, 'image/png'))
    await assertSucceeds(upload(ids.teacherA, 'sheet-music/teacherA/backing.mp3', 1000, 'audio/mpeg'))
  })

  it('a file of 20 MB is accepted, 21 MB is rejected', async () => {
    await assertSucceeds(upload(ids.teacherA, 'sheet-music/teacherA/big.pdf', 20 * MB))
    await assertFails(upload(ids.teacherA, 'sheet-music/teacherA/huge.pdf', 21 * MB))
  })

  it('rejects SVG and other script-capable formats even though they are "images"', async () => {
    await assertFails(upload(ids.teacherA, 'sheet-music/teacherA/x.svg', 1000, 'image/svg+xml'))
    await assertFails(upload(ids.teacherA, 'sheet-music/teacherA/x.html', 1000, 'text/html'))
    await assertFails(upload(ids.teacherA, 'sheet-music/teacherA/x.js', 1000, 'application/javascript'))
  })

  it('nobody can list a teacher folder to discover file names', async () => {
    await assertFails(as(ids.teacherA).ref('sheet-music/teacherA').listAll())
    await assertFails(as(ids.adultA).ref('sheet-music/teacherA').listAll())
  })

  it('rejects file types that are not image, PDF or mp3', async () => {
    await assertFails(upload(ids.teacherA, 'sheet-music/teacherA/app.exe', 1000, 'application/x-msdownload'))
    await assertFails(upload(ids.teacherA, 'sheet-music/teacherA/page.html', 1000, 'text/html'))
    await assertFails(upload(ids.teacherA, 'sheet-music/teacherA/clip.mp4', 1000, 'video/mp4'))
  })

  it("a teacher cannot upload into another teacher's folder", async () => {
    await assertFails(upload(ids.teacherA, 'sheet-music/teacherB/new.pdf'))
  })

  it('a pending or rejected teacher cannot upload', async () => {
    await assertFails(upload(ids.teacherPending, 'sheet-music/teacherPending/new.pdf'))
    await assertFails(upload(ids.teacherRejected, 'sheet-music/teacherRejected/new.pdf'))
  })

  it('a student cannot upload sheet music, even into their own teacher folder', async () => {
    await assertFails(upload(ids.adultA, 'sheet-music/teacherA/new.pdf'))
    await assertFails(upload(ids.adultA, 'sheet-music/adultA/new.pdf'))
  })

  it('anonymous users cannot upload', async () => {
    await assertFails(anonymous().ref('sheet-music/teacherA/new.pdf').put(bytes(10), { contentType: 'application/pdf' }))
  })

  it('the teacher and their linked students read the file', async () => {
    await assertSucceeds(as(ids.teacherA).ref('sheet-music/teacherA/etude.pdf').getDownloadURL())
    await assertSucceeds(as(ids.adultA).ref('sheet-music/teacherA/etude.pdf').getDownloadURL())
    await assertSucceeds(as(ids.minorNoConsent).ref('sheet-music/teacherA/etude.pdf').getDownloadURL())
  })

  it("students of another teacher cannot read the file", async () => {
    await assertFails(as(ids.studentB).ref('sheet-music/teacherA/etude.pdf').getDownloadURL())
  })

  it('a student the teacher has not confirmed yet cannot read the teacher files', async () => {
    await assertFails(as(ids.pendingStudent).ref('sheet-music/teacherA/etude.pdf').getDownloadURL())
  })

  it('a removed student cannot read the teacher files any more', async () => {
    await assertFails(as(ids.removedStudent).ref('sheet-music/teacherA/etude.pdf').getDownloadURL())
  })

  it('an unlinked student cannot read the file', async () => {
    await assertFails(as(ids.unlinked).ref('sheet-music/teacherA/etude.pdf').getDownloadURL())
  })

  it('another teacher cannot read the file', async () => {
    await assertFails(as(ids.teacherB).ref('sheet-music/teacherA/etude.pdf').getDownloadURL())
  })

  it('anonymous users cannot read the file', async () => {
    await assertFails(anonymous().ref('sheet-music/teacherA/etude.pdf').getDownloadURL())
  })

  it('the teacher deletes their own file; others cannot', async () => {
    await assertFails(as(ids.teacherB).ref('sheet-music/teacherA/etude.pdf').delete())
    await assertFails(as(ids.adultA).ref('sheet-music/teacherA/etude.pdf').delete())
    await assertSucceeds(as(ids.teacherA).ref('sheet-music/teacherA/etude.pdf').delete())
  })
})

describe('recordings: recordings/{studentId}/{assignmentId}/{itemId}', () => {
  const upload = (uid: string, path: string, size = 1000, contentType = 'audio/webm') =>
    as(uid).ref(path).put(bytes(size), { contentType })

  it('an adult with consent uploads a recording', async () => {
    await assertSucceeds(upload(ids.adultA, 'recordings/adultA/a1/i2'))
  })

  it('a minor with parent consent uploads a recording', async () => {
    await assertSucceeds(upload(ids.minorA, 'recordings/minorA/a2/i2'))
  })

  it('a minor WITHOUT parent consent cannot upload a recording', async () => {
    await assertFails(upload(ids.minorNoConsent, 'recordings/minorNoConsent/a3/i1'))
  })

  it('replacing an existing recording works (same path)', async () => {
    await assertSucceeds(upload(ids.adultA, 'recordings/adultA/a1/i1'))
  })

  it('accepts the codec suffix browsers add (audio/webm;codecs=opus)', async () => {
    await assertSucceeds(upload(ids.adultA, 'recordings/adultA/a1/i2', 1000, 'audio/webm;codecs=opus'))
  })

  it('nobody can list recordings folders', async () => {
    await assertFails(as(ids.adultA).ref('recordings/adultA').listAll())
    await assertFails(as(ids.teacherA).ref('recordings/adultA/a1').listAll())
  })

  it('anonymous sign-in is refused', async () => {
    const anon = env.authenticatedContext('adultA', { firebase: { sign_in_provider: 'anonymous' } }).storage()
    await assertFails(anon.ref('recordings/adultA/a1/i2').put(bytes(10), { contentType: 'audio/webm' }))
    await assertFails(anon.ref('recordings/adultA/a1/i1').getDownloadURL())
  })

  it('accepts typical browser formats (webm, mp4, ogg)', async () => {
    await assertSucceeds(upload(ids.adultA, 'recordings/adultA/a1/i2', 1000, 'audio/mp4'))
    await assertSucceeds(upload(ids.adultA, 'recordings/adultA/a1/i3', 1000, 'audio/ogg'))
  })

  it('a recording of 5 MB is accepted, 6 MB is rejected', async () => {
    await assertSucceeds(upload(ids.adultA, 'recordings/adultA/a1/i2', 5 * MB))
    await assertFails(upload(ids.adultA, 'recordings/adultA/a1/i3', 6 * MB))
  })

  it('rejects non-audio files', async () => {
    await assertFails(upload(ids.adultA, 'recordings/adultA/a1/i2', 1000, 'video/mp4'))
    await assertFails(upload(ids.adultA, 'recordings/adultA/a1/i2', 1000, 'application/pdf'))
    await assertFails(upload(ids.adultA, 'recordings/adultA/a1/i2', 1000, 'text/html'))
  })

  it("a student cannot upload into another student's folder", async () => {
    await assertFails(upload(ids.adultA, 'recordings/studentB/aB/i1'))
    await assertFails(upload(ids.adultA, 'recordings/minorA/a2/i3'))
  })

  it('a recording must belong to a real assignment of the student', async () => {
    await assertFails(upload(ids.adultA, 'recordings/adultA/doesNotExist/i1'))
    // aB belongs to another student.
    await assertFails(upload(ids.adultA, 'recordings/adultA/aB/i1'))
  })

  it('a teacher cannot upload a recording for a student', async () => {
    await assertFails(upload(ids.teacherA, 'recordings/adultA/a1/i2'))
  })

  it('an unlinked student without assignments cannot upload', async () => {
    await assertFails(upload(ids.unlinked, 'recordings/unlinked/a1/i1'))
  })

  it('anonymous users cannot upload', async () => {
    await assertFails(anonymous().ref('recordings/adultA/a1/i2').put(bytes(10), { contentType: 'audio/webm' }))
  })

  it('the student and their own teacher read the recording', async () => {
    await assertSucceeds(as(ids.adultA).ref('recordings/adultA/a1/i1').getDownloadURL())
    await assertSucceeds(as(ids.teacherA).ref('recordings/adultA/a1/i1').getDownloadURL())
    await assertSucceeds(as(ids.teacherA).ref('recordings/minorA/a2/i1').getDownloadURL())
  })

  it("another teacher cannot read the student's recording", async () => {
    await assertFails(as(ids.teacherB).ref('recordings/adultA/a1/i1').getDownloadURL())
  })

  it("another student cannot read the recording", async () => {
    await assertFails(as(ids.studentB).ref('recordings/adultA/a1/i1').getDownloadURL())
    await assertFails(as(ids.minorA).ref('recordings/adultA/a1/i1').getDownloadURL())
  })

  it('the teacher cannot hear recordings of a pending or removed student', async () => {
    await assertFails(as(ids.teacherA).ref('recordings/pendingStudent/aP/i1').getDownloadURL())
    await assertFails(as(ids.teacherA).ref('recordings/removedStudent/aR/i1').getDownloadURL())
  })

  it('a pending or rejected teacher cannot read recordings', async () => {
    await assertFails(as(ids.teacherPending).ref('recordings/adultA/a1/i1').getDownloadURL())
    await assertFails(as(ids.teacherRejected).ref('recordings/adultA/a1/i1').getDownloadURL())
  })

  it('anonymous users cannot read recordings', async () => {
    await assertFails(anonymous().ref('recordings/adultA/a1/i1').getDownloadURL())
  })

  it('nobody can delete a recording from the client', async () => {
    await assertFails(as(ids.adultA).ref('recordings/adultA/a1/i1').delete())
    await assertFails(as(ids.teacherA).ref('recordings/adultA/a1/i1').delete())
  })
})

describe('everything else is closed', () => {
  it('no files outside the two known folders', async () => {
    await assertFails(as(ids.teacherA).ref('public/logo.png').put(bytes(10), { contentType: 'image/png' }))
    await assertFails(as(ids.adultA).ref('random/file.mp3').put(bytes(10), { contentType: 'audio/mpeg' }))
    await assertFails(as(ids.teacherA).ref('random/file.mp3').getDownloadURL())
  })
})
