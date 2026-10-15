// End-to-end check of sign-up / sign-in in a phone-sized browser.
// Run through:  npm run test:e2e   (starts the emulators and the dev server itself)
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const SHOTS = process.env.SHOTS_DIR ?? 'e2e-screenshots'
mkdirSync(SHOTS, { recursive: true })
const BASE = 'http://127.0.0.1:5173'
const PROJECT = 'ettunley-61749'
let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) failures++
}

const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'ignore' })
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE)).ok) break } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500))
}

const authHost = 'http://127.0.0.1:9099'
const fsHost = 'http://127.0.0.1:8080'
const profileOf = async (uid) => {
  const r = await fetch(`${fsHost}/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`, { headers: { Authorization: 'Bearer owner' } })
  return r.ok ? Object.fromEntries(Object.entries((await r.json()).fields).map(([k, v]) => [k, Object.values(v)[0]])) : null
}
const uidOf = async (email) => {
  const r = await fetch(`${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ returnUserInfo: true }),
  })
  const users = (await r.json()).userInfo ?? []
  return users.find((u) => u.email === email)?.localId
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => check('no page errors', false, e.message))
  return page
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` })

try {
  // ---------- welcome screen, RTL, layout ----------
  let page = await newPage()
  await page.goto(BASE)
  await page.waitForSelector('text=הרשמה')
  check('opens on the welcome screen', page.url().endsWith('/welcome'))
  check('page is right-to-left Hebrew', (await page.evaluate(() => document.documentElement.dir + document.documentElement.lang)) === 'rtlhe')
  check('no sideways scrolling', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
  const heights = await page.$$eval('a,button', (els) => els.map((e) => e.getBoundingClientRect().height))
  check('buttons are big enough to tap (>= 44px)', heights.every((h) => h >= 44), String(heights))
  await shot(page, '1-welcome')

  // ---------- student sign-up with e-mail ----------
  await page.click('text=הרשמה')
  await page.waitForSelector('text=מי את/ה?')
  await shot(page, '2-signup-choose-role')
  await page.click('role=radio[name=/תלמיד/]')
  await page.waitForSelector('#name')
  await shot(page, '3-signup-student')

  await page.fill('#name', 'נועה כהן')
  await page.fill('#email', 'noa@example.com')
  await page.fill('#password', 'short')
  await page.click('text=יצירת חשבון')
  check('short password is refused with a Hebrew message', await page.locator('[role=alert]').innerText().then((t) => t.includes('8')))
  await shot(page, '4-signup-short-password')

  await page.fill('#password', 'correct-horse-9')
  await page.click('text=יצירת חשבון')
  await page.waitForSelector('text=שלום, נועה כהן')
  check('student lands on the home screen', page.url().endsWith('/home'))
  await shot(page, '5-home-student')
  const noaUid = await uidOf('noa@example.com')
  const noa = await profileOf(noaUid)
  check('student profile saved with role=student and no extra fields', noa?.role === 'student' && noa.name === 'נועה כהן' && !('teacherStatus' in noa), JSON.stringify(noa))

  // ---------- sign out, wrong password, sign in ----------
  await page.click('text=יציאה')
  await page.waitForSelector('text=הרשמה')
  check('sign-out returns to the welcome screen', page.url().endsWith('/welcome'))
  await page.click('text=כניסה')
  await page.fill('#email', 'noa@example.com')
  await page.fill('#password', 'wrong-password-1')
  await page.click('button[type=submit]')
  await page.waitForSelector('[role=alert]')
  check('wrong password shows an error', (await page.locator('[role=alert]').innerText()).includes('לא נכונים'))
  await shot(page, '6-login-error')
  await page.fill('#password', 'correct-horse-9')
  await page.click('button[type=submit]')
  await page.waitForSelector('text=שלום, נועה כהן')
  check('signing in again works', true)
  await page.reload()
  await page.waitForSelector('text=שלום, נועה כהן')
  check('stays signed in after a reload', true)

  // ---------- the same e-mail cannot sign up twice ----------
  await page.click('text=יציאה')
  await page.waitForSelector('text=הרשמה')
  await page.goto(`${BASE}/signup`)
  await page.click('role=radio[name=/תלמיד/]')
  await page.fill('#name', 'מישהו')
  await page.fill('#email', 'noa@example.com')
  await page.fill('#password', 'another-pass-1')
  await page.click('text=יצירת חשבון')
  await page.waitForSelector('[role=alert]')
  check('a taken e-mail is explained', (await page.locator('[role=alert]').innerText()).includes('כבר יש חשבון'))

  // ---------- teacher with Google ----------
  // The real Google pop-up needs apis.google.com, which this test machine cannot
  // reach. So the pop-up is held open (never answers) and the Auth emulator's
  // fake Google account is signed in from the page instead. Everything after
  // the pop-up (role choice, profile creation, screens) is the real code.
  const holdGooglePopup = (page) => page.route('https://apis.google.com/**', () => {})
  const fakeGoogleSignIn = (page, email, name) =>
    page.evaluate(async ({ email, name }) => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('firebase_auth'))
      const mod = await import(url)
      const { auth } = await import('/src/lib/firebase.ts')
      const idToken = JSON.stringify({ sub: email, email, email_verified: true, display_name: name, name })
      await mod.signInWithCredential(auth, mod.GoogleAuthProvider.credential(idToken))
    }, { email, name })
  page = await newPage()
  await holdGooglePopup(page)
  await page.goto(`${BASE}/signup`)
  await page.click('role=radio[name=/מורה/]')
  await page.waitForSelector('text=מורים נרשמים עם חשבון Google')
  check('a teacher is not offered e-mail sign-up', (await page.locator('#password').count()) === 0)
  await shot(page, '7-signup-teacher')
  await page.click('text=הרשמה עם Google')
  await page.waitForTimeout(500)
  await fakeGoogleSignIn(page, 'dana.teacher@example.com', 'דנה המורה')
  await page.waitForSelector('text=ממתין לאישור')
  const danaText = await page.locator('main').innerText()
  check('a new teacher sees the exact pending message', danaText.includes('החשבון שלך ממתין לאישור. נעדכן אותך כשהוא יאושר.'))
  await shot(page, '8-home-teacher-pending')
  const dana = await profileOf(await uidOf('dana.teacher@example.com'))
  check('teacher profile is role=teacher, status=pending, no invite code', dana?.role === 'teacher' && dana.teacherStatus === 'pending' && !('inviteCode' in dana), JSON.stringify(dana))

  // ---------- Google user without a profile: choose a role ----------
  page = await newPage()
  await holdGooglePopup(page)
  await page.goto(`${BASE}/login`)
  await page.click('text=כניסה עם Google')
  await page.waitForTimeout(500)
  await fakeGoogleSignIn(page, 'yael.new@example.com', 'יעל')
  await page.waitForSelector('text=עוד רגע וסיימנו')
  check('a signed-in person without a profile is asked who they are', page.url().endsWith('/choose-role'))
  check('name is pre-filled from Google', (await page.inputValue('#name')) === 'יעל')
  await shot(page, '9-choose-role')
  await page.click('role=radio[name=/תלמיד/]')
  await page.click('text=המשך')
  await page.waitForSelector('text=שלום, יעל')
  check('then lands on the student home', (await profileOf(await uidOf('yael.new@example.com')))?.role === 'student')

  // ---------- e-mail account without profile cannot become a teacher ----------
  const signUpRaw = await fetch(`${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'noprofile@example.com', password: 'some-password-1' }),
  })
  check('(setup) auth account without profile created', signUpRaw.ok)
  page = await newPage()
  await page.goto(`${BASE}/login`)
  await page.fill('#email', 'noprofile@example.com')
  await page.fill('#password', 'some-password-1')
  await page.click('button[type=submit]')
  await page.waitForSelector('text=עוד רגע וסיימנו')
  check('teacher option is disabled for e-mail accounts', await page.locator('role=radio[name=/מורה/]').isDisabled())
  await shot(page, '10-choose-role-email-account')
} finally {
  await browser.close()
  server.kill()
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
