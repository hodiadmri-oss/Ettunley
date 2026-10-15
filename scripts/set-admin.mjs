// Gives one Google account the "admin" claim, so it can open /admin.
// Run it only on the owner's side (Google Cloud Shell or her computer), never from the app.
//
//   node set-admin.mjs owner@gmail.com            (real project; uses your own Google login)
//   node set-admin.mjs owner@gmail.com --remove   (takes the claim away again)
//
// It needs the e-mail to already exist in the project (sign in once with Google first)
// and to be verified. No key file is needed: Cloud Shell already knows who you are.
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const [email, flag] = process.argv.slice(2)
if (!email || !email.includes('@')) {
  console.error('Usage: node set-admin.mjs <google-email> [--remove]')
  process.exit(1)
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'ettunley-61749' })
const auth = getAuth()

try {
  const user = await auth.getUserByEmail(email)
  if (flag === '--remove') {
    await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: null })
    await auth.revokeRefreshTokens(user.uid)
    console.log(`Admin removed from ${email}.`)
  } else {
    if (!user.emailVerified) throw new Error('This e-mail is not verified. Sign in with Google first.')
    if (!user.providerData.some((p) => p.providerId === 'google.com')) {
      throw new Error('This account does not use Google sign-in.')
    }
    await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true })
    await auth.revokeRefreshTokens(user.uid)
    console.log(`Done: ${email} is now the admin. Sign out and sign in again in the app.`)
  }
} catch (e) {
  console.error('Failed:', e.message)
  process.exit(1)
}
