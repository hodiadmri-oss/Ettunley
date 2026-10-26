import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { defineSecret, defineString } from 'firebase-functions/params'

// The key is stored as a Functions secret, never in the code or the repository.
export const resendApiKey = defineSecret('RESEND_API_KEY')
const emailFrom = defineString('EMAIL_FROM', { default: 'Etunley <onboarding@resend.dev>' })

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

// In the local emulator nothing is sent: the message is put in `devOutbox` so the
// tests (and the owner, in the emulator UI) can read it. This branch can never run
// in production, where FUNCTIONS_EMULATOR is not set.
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    await getFirestore()
      .collection('devOutbox')
      .add({ ...message, createdAt: FieldValue.serverTimestamp() })
    return
  }

  const apiKey = resendApiKey.value()
  // "not-set-yet" is the placeholder the deploy script stores until a real key exists.
  if (!apiKey || apiKey === 'not-set-yet') {
    throw new HttpsError('failed-precondition', 'שליחת מיילים עוד לא הוגדרה.')
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: emailFrom.value(),
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  })
  // Never log the address, the body or the response: they hold personal data.
  if (!response.ok) throw new HttpsError('unavailable', 'השליחה לא הצליחה.')
}
