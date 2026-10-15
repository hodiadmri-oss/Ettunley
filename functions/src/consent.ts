import { createHash, randomBytes } from 'node:crypto'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { defineString } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { parseUid, requireApprovedTeacher } from './guards'
import { resendApiKey, sendEmail } from './email'
import { consumeAttempt, DAY_MS, ipKey } from './rateLimit'

// Bump this when the text the parent ticks changes. The page sends the version it
// showed, so a stale page cannot approve a text the parent did not see.
export const CONSENT_TEXT_VERSION = 1

const TOKEN_VALID_MS = 7 * DAY_MS
const MAX_SENDS_PER_STUDENT_PER_DAY = 3
const MAX_SENDS_PER_TEACHER_PER_DAY = 20
const MAX_LINK_CHECKS_PER_IP_PER_HOUR = 60
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/

const appUrl = defineString('APP_URL', { default: 'http://127.0.0.1:5173' })
// One setting for the privacy contact address (see CLAUDE.md).
const privacyContact = defineString('PRIVACY_CONTACT_EMAIL', { default: 'privacy@example.invalid' })

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Wrong, expired, used and unknown links all look the same from the outside.
const badLink = () => new HttpsError('failed-precondition', 'הקישור לא תקין או שפג תוקפו.')

function parseEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (email.length > 254 || !/^[^\s@<>",;]{1,64}@[^\s@<>",;]{1,190}\.[^\s@<>",;]{2,}$/.test(email)) {
    throw new HttpsError('invalid-argument', 'כתובת האימייל לא תקינה.')
  }
  return email
}

function buildEmail(opts: { childName: string; teacherName: string; link: string; contact: string }) {
  const { childName, teacherName, link, contact } = opts
  // While the address is still the placeholder (see LAUNCH-CHECKLIST.md) the line is left out.
  const hasContact = !contact.endsWith('.invalid')
  const subject = 'אישור הורה לשימוש באפליקציה'
  const lines = [
    'שלום,',
    `${teacherName}, המורה למוזיקה, הזמין/ה את ${childName} להשתמש באפליקציה לתרגול בין השיעורים.`,
    `מכיוון ש${childName} קטין/ה, נדרש אישור שלך, ההורה או האפוטרופוס. האישור נדרש פעם אחת בלבד.`,
    'מה האישור כולל: הקלטות התרגול ישמרו באפליקציה וישותפו עם המורה. ההקלטות נמחקות אוטומטית אחרי 12 חודשים, ואפשר לבקש מחיקה בכל זמן.',
    `לקריאת הפרטים ולאישור: ${link}`,
    'הקישור אישי ותקף ל-7 ימים. אם לא ציפיתם להודעה הזאת, אפשר להתעלם ממנה ולא יקרה כלום.',
    ...(hasContact ? [`שאלות, ביטול או מחיקת מידע: ${contact}`] : []),
  ]
  const text = lines.join('\n\n')
  const html =
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#2f2a33">` +
    `<p>שלום,</p>` +
    `<p><strong>${escapeHtml(teacherName)}</strong>, המורה למוזיקה, הזמין/ה את <strong>${escapeHtml(childName)}</strong> להשתמש באפליקציה לתרגול בין השיעורים.</p>` +
    `<p>מכיוון ש${escapeHtml(childName)} קטין/ה, נדרש אישור שלך, ההורה או האפוטרופוס. האישור נדרש <strong>פעם אחת בלבד</strong>.</p>` +
    `<p>מה האישור כולל: הקלטות התרגול ישמרו באפליקציה וישותפו עם המורה. ההקלטות נמחקות אוטומטית אחרי 12 חודשים, ואפשר לבקש מחיקה בכל זמן.</p>` +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f2a33;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none">לקריאת הפרטים ולאישור</a></p>` +
    `<p style="color:#666;font-size:14px">הקישור אישי ותקף ל-7 ימים. אם לא ציפיתם להודעה הזאת, אפשר להתעלם ממנה ולא יקרה כלום.</p>` +
    (hasContact ? `<p style="color:#666;font-size:14px">שאלות, ביטול או מחיקת מידע: ${escapeHtml(contact)}</p>` : '') +
    `</div>`
  return { subject, text, html }
}

// The teacher enters the parent's e-mail. Allowed only for a confirmed student who
// is a minor and has no consent yet. Sending again replaces the earlier link.
export const sendParentConsent = onCall({ secrets: [resendApiKey] }, async (request) => {
  const teacherUid = await requireApprovedTeacher(request)
  const studentId = parseUid(request.data?.studentId)
  const parentEmail = parseEmail(request.data?.parentEmail)
  const db = getFirestore()

  const studentSnap = await db.doc(`users/${studentId}`).get()
  const student = studentSnap.data()
  // Someone else's student looks exactly like a student that does not exist.
  if (!studentSnap.exists || student?.role !== 'student' || student.teacherId !== teacherUid) {
    throw new HttpsError('permission-denied', 'אין הרשאה.')
  }
  if (student.linkStatus !== 'approved') {
    throw new HttpsError('failed-precondition', 'קודם צריך לאשר את התלמיד/ה.')
  }
  if (student.isMinor !== true || student.consentAt) {
    throw new HttpsError('failed-precondition', 'אין צורך באישור הורה.')
  }

  // The teacher could otherwise use this to send mail to anyone.
  const studentOk = await consumeAttempt(`consentS_${studentId}`, MAX_SENDS_PER_STUDENT_PER_DAY, DAY_MS)
  const teacherOk = await consumeAttempt(`consentT_${teacherUid}`, MAX_SENDS_PER_TEACHER_PER_DAY, DAY_MS)
  if (!studentOk || !teacherOk) {
    throw new HttpsError('resource-exhausted', 'נשלחו יותר מדי הודעות. אפשר לנסות שוב מחר.')
  }

  // 256 random bits. Only the hash is stored.
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  await db.doc(`parentConsents/${studentId}`).set({
    studentId,
    teacherId: teacherUid,
    parentEmail,
    tokenHash: sha256(token),
    sentAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + TOKEN_VALID_MS),
  })

  const link = `${appUrl.value().replace(/\/$/, '')}/consent/approve#${token}`
  const content = buildEmail({
    childName: String(student.name),
    teacherName: String(student.teacherName ?? ''),
    link,
    contact: privacyContact.value(),
  })
  await sendEmail({ to: parentEmail, ...content })
  return { status: 'sent' as const }
})

interface ConsentLookup {
  ref: FirebaseFirestore.DocumentReference
  data: FirebaseFirestore.DocumentData
}

// Finds the consent record for a link, or null for every kind of bad link.
async function findValidConsent(token: unknown): Promise<ConsentLookup | null> {
  if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) return null
  const snap = await getFirestore().collection('parentConsents').where('tokenHash', '==', sha256(token)).limit(1).get()
  const doc = snap.docs[0]
  if (!doc) return null
  const data = doc.data()
  if (data.approvedAt || !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now()) return null
  return { ref: doc.ref, data }
}

// The public page asks this first: whose consent is it? Reading never changes anything,
// so mail scanners that open the link cannot approve anything.
export const getParentConsentInfo = onCall(async (request) => {
  const ip = ipKey(request.rawRequest?.ip)
  if (ip && !(await consumeAttempt(ip, MAX_LINK_CHECKS_PER_IP_PER_HOUR))) return { valid: false as const }

  const found = await findValidConsent(request.data?.token)
  if (!found) return { valid: false as const }
  const student = (await getFirestore().doc(`users/${found.data.studentId}`).get()).data()
  if (!student || student.isMinor !== true || student.consentAt) return { valid: false as const }
  return {
    valid: true as const,
    childName: String(student.name),
    teacherName: String(student.teacherName ?? ''),
    textVersion: CONSENT_TEXT_VERSION,
  }
})

// The parent ticks the box and presses approve: a deliberate action, not a link click.
export const approveParentConsent = onCall(async (request) => {
  const parentName = typeof request.data?.parentName === 'string' ? request.data.parentName.trim().replace(/\s+/g, ' ') : ''
  if (parentName.length < 1 || parentName.length > 60) {
    throw new HttpsError('invalid-argument', 'צריך לכתוב שם.')
  }
  if (request.data?.textVersion !== CONSENT_TEXT_VERSION) {
    throw new HttpsError('failed-precondition', 'הדף התעדכן. צריך לרענן אותו.')
  }
  const ip = ipKey(request.rawRequest?.ip)
  if (ip && !(await consumeAttempt(ip, MAX_LINK_CHECKS_PER_IP_PER_HOUR))) throw badLink()

  const found = await findValidConsent(request.data?.token)
  if (!found) throw badLink()

  const db = getFirestore()
  await db.runTransaction(async (tx) => {
    const consent = await tx.get(found.ref)
    const data = consent.data()
    // Re-check inside the transaction: the link can be used only once.
    if (!data || data.approvedAt || data.tokenHash !== sha256(request.data.token as string)) throw badLink()

    const studentRef = db.doc(`users/${data.studentId}`)
    const student = (await tx.get(studentRef)).data()
    if (!student || student.isMinor !== true || student.consentAt || student.teacherId !== data.teacherId) {
      throw badLink()
    }
    tx.update(found.ref, {
      parentName,
      approvedAt: FieldValue.serverTimestamp(),
      consentTextVersion: CONSENT_TEXT_VERSION,
      tokenHash: FieldValue.delete(), // single use: the link stops working
    })
    tx.update(studentRef, { consentBy: 'parent', consentAt: FieldValue.serverTimestamp() })
  })
  return { status: 'approved' as const }
})
