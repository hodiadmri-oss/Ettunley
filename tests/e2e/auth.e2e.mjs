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


const isoYearsAgo = (years) => new Date(Date.now() - years * 365.25 * 86400000).toISOString().slice(0, 10)
const confirmBirthDate = async (page, iso) => {
  await page.fill('#birth', iso)
  await page.click('text=אישור תאריך הלידה')
  await page.waitForSelector('text=(אי אפשר לשנות)')
}
const pickInstrumentAndLevel = async (page) => {
  await page.selectOption('#instrument', 'פסנתר')
  await page.click('role=radio[name=/מתחיל/]')
  await page.waitForFunction(() => document.querySelector('[role=radio][aria-checked=true]'))
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
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
  await page.waitForSelector('text=כמה פרטים עליך')
  const noaUid = await uidOf('noa@example.com')
  const noa = await profileOf(noaUid)
  check('student profile saved with role=student and no extra fields', noa?.role === 'student' && noa.name === 'נועה כהן' && !('teacherStatus' in noa), JSON.stringify(noa))
  check('a new student is taken to onboarding first', true)
  await shot(page, '13-onboarding-start')

  // ---------- onboarding as an ADULT ----------
  check('the instrument list has cello', (await page.locator('#instrument option').allInnerTexts()).includes('צ׳לו'))
  await page.fill('#birth', '1990-05-01')
  await page.waitForSelector('text=הגיל: 3')
  await shot(page, '14-onboarding-age')
  await page.click('text=אישור תאריך הלידה')
  await page.waitForSelector('text=(אי אפשר לשנות)')
  check('birth date and isMinor are saved together, once', await profileOf(noaUid).then((p) => p.isMinor === false && p.birthDate?.startsWith('1990-05-01')))
  check('the date can no longer be edited', (await page.locator('#birth').count()) === 0)
  await pickInstrumentAndLevel(page)
  const fields = await profileOf(noaUid)
  check('instrument and level are saved immediately', fields.instrument === 'פסנתר' && fields.level === 'beginner', JSON.stringify(fields))
  await page.reload()
  await page.waitForSelector('text=(אי אפשר לשנות)')
  check('after a reload the saved fields are still there', (await page.inputValue('#instrument')) === 'פסנתר')
  check('an adult sees the consent checkbox with the agreed wording', await page.locator('text=אני מאשר/ת שהקלטות התרגול יישמרו וישותפו עם המורה שלי.').count() === 1)
  check('the Finish button is locked until the box is ticked', await page.locator('button:has-text("סיום")').isDisabled())
  await shot(page, '15-onboarding-adult-consent')
  await page.check('input[type=checkbox]')
  await page.click('button:has-text("סיום")')
  await page.waitForSelector('text=הצטרפות למורה')
  check('a student lands on /student (and is asked for the teacher code)', page.url().endsWith('/student'))
  await shot(page, '5-home-student')
  const adult = await profileOf(noaUid)
  check('adult consent is stored as self with a time', adult.consentBy === 'self' && Boolean(adult.consentAt), JSON.stringify(adult))

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
  await page.waitForSelector('text=הצטרפות למורה')
  check('signing in again works', true)
  await page.reload()
  await page.waitForSelector('text=הצטרפות למורה')
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

  // ---------- forgot password ----------
  const oobCodes = async () =>
    (await (await fetch(`${authHost}/emulator/v1/projects/${PROJECT}/oobCodes`)).json()).oobCodes ?? []
  await page.goto(`${BASE}/login`)
  await page.click('text=שכחתי סיסמה')
  await page.waitForSelector('text=איפוס סיסמה')
  await shot(page, '11-reset-password')
  await page.fill('#email', 'noa@example.com')
  await page.click('text=שליחת קישור')
  await page.waitForSelector('[role=status]')
  const sentMessage = await page.locator('[role=status]').innerText()
  const codes = (await oobCodes()).filter((c) => c.requestType === 'PASSWORD_RESET' && c.email === 'noa@example.com')
  check('a reset e-mail is created for a real account', codes.length === 1)
  await shot(page, '12-reset-sent')

  const page2 = await newPage()
  await page2.goto(`${BASE}/reset`)
  await page2.fill('#email', 'nobody-here@example.com')
  await page2.click('text=שליחת קישור')
  await page2.waitForSelector('[role=status]')
  check('an unknown e-mail gets the very same answer', (await page2.locator('[role=status]').innerText()) === sentMessage)
  check('and no e-mail is created for it', !(await oobCodes()).some((c) => c.email === 'nobody-here@example.com'))

  const reset = await fetch(`${authHost}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=x`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: codes[0].oobCode, newPassword: 'brand-new-pass-7' }),
  })
  check('(emulator) the link in the e-mail sets a new password', reset.ok)
  await page2.goto(`${BASE}/login`)
  await page2.fill('#email', 'noa@example.com')
  await page2.fill('#password', 'correct-horse-9')
  await page2.click('button[type=submit]')
  await page2.waitForSelector('[role=alert]')
  check('the old password no longer works', true)
  await page2.fill('#password', 'brand-new-pass-7')
  await page2.click('button[type=submit]')
  await page2.waitForSelector('text=הצטרפות למורה')
  check('the new password works', true)

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
  await page.waitForSelector('text=כמה פרטים עליך')

  // ---------- onboarding as a MINOR ----------
  await confirmBirthDate(page, isoYearsAgo(10))
  await pickInstrumentAndLevel(page)
  check('a minor sees the recording-locked notice (exact text)', await page.locator('text=ההקלטות ייפתחו אחרי שההורה יאשר במייל').count() === 1)
  check('and that the parent approves only once', await page.locator('text=ההורה מאשר פעם אחת בלבד').count() === 1)
  check('and no consent checkbox', (await page.locator('input[type=checkbox]').count()) === 0)
  await shot(page, '16-onboarding-minor')
  await page.click('button:has-text("סיום")')
  await page.waitForSelector('text=הצטרפות למורה')
  const yael = await profileOf(await uidOf('yael.new@example.com'))
  check('a minor is stored as isMinor=true WITHOUT any consent', yael.role === 'student' && yael.isMinor === true && !('consentAt' in yael), JSON.stringify(yael))

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

  // ---------- teacher approval by the owner ----------
  // The owner's account: a Google account that has the admin claim (set the way the script does).
  const ownerLogin = await fetch(`${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=x`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: 'owner@example.com', email: 'owner@example.com', email_verified: true }))}&providerId=google.com`,
      requestUri: 'http://localhost', returnIdpCredential: true, returnSecureToken: true,
    }),
  })
  const ownerUid = (await ownerLogin.json()).localId
  await fetch(`${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: ownerUid, customAttributes: JSON.stringify({ admin: true }) }),
  })

  const danaUid = await uidOf('dana.teacher@example.com')
  const owner = await newPage()
  await holdGooglePopup(owner)
  await owner.goto(`${BASE}/login`)
  await owner.click('text=כניסה עם Google')
  await owner.waitForTimeout(500)
  await fakeGoogleSignIn(owner, 'owner@example.com', 'המנהלת')
  await owner.waitForSelector('text=ממתינים לאישור (')
  check('the owner goes straight to the admin page (no teacher/student profile needed)', owner.url().endsWith('/admin'))
  check('the pending teacher is listed with her e-mail', (await owner.locator('main').innerText()).includes('dana.teacher@example.com'))
  check('approve is locked while the copyright statement is missing', await owner.locator('article:has-text("דנה המורה") button:has-text("לאשר")').isDisabled())
  await shot(owner, '17-admin-waiting-for-statement')

  const danaPage = await newPage()
  await holdGooglePopup(danaPage)
  await danaPage.goto(`${BASE}/login`)
  await danaPage.click('text=כניסה עם Google')
  await danaPage.waitForTimeout(500)
  await fakeGoogleSignIn(danaPage, 'dana.teacher@example.com', 'דנה המורה')
  await danaPage.waitForSelector('text=החשבון שלך ממתין לאישור')
  check('the teacher must tick the exact copyright statement', await danaPage.locator('text=אני מצהיר/ת שיש לי זכות להשתמש בחומרים שאעלה, ואני אחראי/ת לתוכן שלהם').count() === 1)
  check('send is locked until she ticks it', await danaPage.locator('button:has-text("שליחה")').isDisabled())
  await shot(danaPage, '18-teacher-pending-statement')
  await danaPage.check('input[type=checkbox]')
  await danaPage.click('button:has-text("שליחה")')
  await danaPage.waitForSelector('input[type=checkbox]', { state: 'detached' })
  check('the statement is stored once with a time', Boolean((await profileOf(danaUid)).copyrightStatementAt))

  await owner.click('text=רענון')
  await owner.waitForSelector('article:has-text("דנה המורה") >> text=✓ הצהרת זכויות יוצרים')
  await shot(owner, '19-admin-ready-to-approve')
  await owner.click('article:has-text("דנה המורה") button:has-text("לאשר")')
  await owner.waitForSelector('text=לאשר את דנה המורה?')
  await owner.click('button:has-text("כן")')
  await owner.waitForSelector('text=מורים מאושרים (1)')
  await shot(owner, '20-admin-approved')
  const approved = await profileOf(danaUid)
  check('approving sets the status and creates a 6-character invite code', approved.teacherStatus === 'approved' && /^[2-9A-HJKMNP-Z]{6}$/.test(approved.inviteCode), JSON.stringify(approved))

  await danaPage.reload()
  await danaPage.waitForSelector('text=התלמידים שלי')
  check('the teacher sees she was approved', true)
  check('an ordinary teacher gets no admin link and /admin sends her home', await (async () => {
    await danaPage.goto(`${BASE}/admin`)
    await danaPage.waitForSelector('text=שלום, דנה המורה')
    return danaPage.url().endsWith('/teacher') && (await danaPage.locator('text=ניהול').count()) === 0
  })())


  // ---------- a student joins a teacher with the code ----------
  const noaPage = await newPage()
  await noaPage.goto(`${BASE}/login`)
  await noaPage.fill('#email', 'noa@example.com')
  await noaPage.fill('#password', 'brand-new-pass-7')
  await noaPage.click('button[type=submit]')
  await noaPage.waitForSelector('text=הצטרפות למורה')
  await shot(noaPage, '21-join-teacher')
  check('the Join button waits for a full code', await noaPage.locator('button:has-text("הצטרפות")').isDisabled())

  await noaPage.fill('#code', 'zzzzzz')
  await noaPage.click('button:has-text("הצטרפות")')
  await noaPage.waitForSelector('[role=alert]')
  check('a wrong code shows a gentle Hebrew error', (await noaPage.locator('[role=alert]').innerText()).includes('הקוד לא נכון'))
  await shot(noaPage, '22-join-wrong-code')

  const danaCode = (await profileOf(danaUid)).inviteCode
  await noaPage.fill('#code', danaCode.toLowerCase())
  check('typing is shown in capitals', (await noaPage.inputValue('#code')) === danaCode)
  await noaPage.click('button:has-text("הצטרפות")')
  await noaPage.waitForSelector('text=ממתינים לאישור המורה')
  check('the student now waits, and the teacher name is shown', (await noaPage.locator('main').innerText()).includes('דנה המורה'))
  await shot(noaPage, '23-student-waiting')
  const waiting = await profileOf(noaUid)
  check('the link is stored as pending', waiting.linkStatus === 'pending' && waiting.teacherName === 'דנה המורה', JSON.stringify(waiting))

  await danaPage.goto(`${BASE}/teacher`)
  await danaPage.waitForSelector('text=בקשות הצטרפות (1)')
  const request = await danaPage.locator('article:has-text("נועה כהן")').innerText()
  check('the teacher sees name, self-declared age and instrument', request.includes('גיל 3') && request.includes('הצהרה עצמית') && request.includes('פסנתר'), request)
  await shot(danaPage, '24-teacher-requests')
  await danaPage.click('article:has-text("נועה כהן") button:has-text("אישור")')
  await danaPage.waitForSelector('text=לאשר את נועה כהן?')
  await danaPage.click('button:has-text("כן")')
  await danaPage.waitForSelector('text=התלמידים שלי (1)')
  check('after approval she is among the teacher students', (await profileOf(noaUid)).linkStatus === 'approved')

  await noaPage.click('text=בדיקה מחדש')
  await noaPage.waitForSelector('text=המורה שלך: דנה המורה')
  check('the student sees she was approved', true)
  await noaPage.goto(`${BASE}/teacher`)
  await noaPage.waitForSelector('text=המורה שלך: דנה המורה')
  check('a student who opens /teacher is sent back to /student', noaPage.url().endsWith('/student'))
  await danaPage.goto(`${BASE}/student`)
  await danaPage.waitForSelector('text=התלמידים שלי')
  check('a teacher who opens /student is sent back to /teacher', danaPage.url().endsWith('/teacher'))
  await danaPage.goto(`${BASE}/home`)
  await danaPage.waitForSelector('text=התלמידים שלי')
  check('the old /home and the bare address lead to the role home', danaPage.url().endsWith('/teacher'))
  await shot(noaPage, '37-student-home')
  await shot(noaPage, '25-student-approved')

  // invite code: copy-friendly display, renewing it
  await danaPage.goto(`${BASE}/teacher/settings`)
  await danaPage.waitForSelector('[data-testid=invite-code]')
  check('the teacher sees her code on screen', (await danaPage.locator('[data-testid=invite-code]').innerText()) === danaCode)
  await shot(danaPage, '26-teacher-settings')
  await danaPage.click('text=הקוד דלף? יצירת קוד חדש')
  await danaPage.click('button:has-text("כן, קוד חדש")')
  await danaPage.waitForFunction((old) => document.querySelector('[data-testid=invite-code]')?.textContent !== old, danaCode)
  const newCode = (await profileOf(danaUid)).inviteCode
  check('the code changed and the screen shows the new one', newCode !== danaCode && (await danaPage.locator('[data-testid=invite-code]').innerText()) === newCode)

  // ---------- assignments: the teacher writes one, the student reads it ----------
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
  await danaPage.goto(`${BASE}/teacher`)
  await danaPage.click('a:has-text("נועה כהן")')
  await danaPage.waitForSelector('text=עדיין אין מטלות')
  check('the student page invites a first assignment', await danaPage.locator('text=עדיין אין מטלות').count() === 1)
  await shot(danaPage, '40-teacher-student-page')
  await danaPage.click('a:has-text("מטלה חדשה")')
  await danaPage.waitForSelector('#title')
  await shot(danaPage, '41-assignment-form')
  await danaPage.click('button:has-text("שמירה")')
  check('saving without a title is refused with a Hebrew message', (await danaPage.locator('[role=alert]').innerText()).includes('כותרת'))
  await danaPage.fill('#title', 'סולם סול מז׳ור')
  await danaPage.fill('#description', 'שבוע טוב!')
  await danaPage.fill('input[aria-label="שם פריט 1"]', 'הסולם')
  await danaPage.fill('textarea[aria-label="דגשים לתרגול בפריט 1"]', 'לאט, עם מטרונום')
  await danaPage.fill('input[aria-label="קישור ליוטיוב בפריט 1"]', 'not a link')
  await danaPage.click('button:has-text("שמירה")')
  check('a wrong YouTube link is refused', (await danaPage.locator('[role=alert]').innerText()).includes('יוטיוב'))
  await danaPage.fill('input[aria-label="קישור ליוטיוב בפריט 1"]', 'https://youtu.be/dQw4w9WgXcQ?si=abc')
  await danaPage.fill('input[aria-label="מטרונום בפריט 1"]', '80')
  await danaPage.setInputFiles('input[type=file][accept^="image"]', { name: 'scale.png', mimeType: 'image/png', buffer: tinyPng })
  await danaPage.waitForSelector('text=נבחר: scale.png')
  // a 30-second silent WAV, declared as an mp3 (the browser plays what it can decode)
  const wavBytes = 8000 * 30
  const wav = Buffer.alloc(44 + wavBytes, 128)
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + wavBytes, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28)
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(wavBytes, 40)
  await danaPage.setInputFiles('input[type=file][accept^="audio"]', { name: 'backing.mp3', mimeType: 'audio/mpeg', buffer: wav })
  await danaPage.waitForSelector('text=נבחר: backing.mp3')
  await danaPage.click('button:has-text("+ הוספת פריט")')
  await danaPage.fill('input[aria-label="שם פריט 2"]', 'האטיוד')
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 260]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 20 120 Td (Etunley) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF\n')
  await danaPage.locator('input[type=file][accept^="image"]').nth(1).setInputFiles({ name: 'etude.pdf', mimeType: 'application/pdf', buffer: pdf })
  await danaPage.waitForSelector('text=נבחר: etude.pdf')
  await shot(danaPage, '42-assignment-filled')
  await danaPage.click('button:has-text("שמירה")')
  await danaPage.waitForSelector('a:has-text("סולם סול מז׳ור")')
  check('after saving she is back on the student page and the assignment is listed under this week', (await danaPage.locator('main').innerText()).includes('השבוע'))
  await shot(danaPage, '43-teacher-assignment-listed')

  await noaPage.goto(`${BASE}/student`)
  await noaPage.waitForSelector('a:has-text("סולם סול מז׳ור")')
  check('the student sees the assignment on her home screen', true)
  await shot(noaPage, '44-student-assignments')
  await noaPage.click('a:has-text("סולם סול מז׳ור")')
  await noaPage.waitForSelector('text=לאט, עם מטרונום')
  const view = await noaPage.locator('main').innerText()
  check('she sees both items, the tips and the goal', view.includes('הסולם') && view.includes('האטיוד') && view.includes('יעד יומי: 15 דקות') && view.includes('שבוע טוב!'), view)
  const yt = await noaPage.locator('a:has-text("פתיחה ביוטיוב")').getAttribute('href')
  check('the YouTube link is rebuilt from the video id and opens safely', yt === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' && (await noaPage.locator('a:has-text("פתיחה ביוטיוב")').getAttribute('rel')) === 'noopener noreferrer')
  await noaPage.waitForSelector('img[alt="תווים"]')
  check('the sheet music image loads for the student (private file, her own sign-in)', await noaPage.$eval('img[alt="תווים"]', (img) => img.src.startsWith('blob:')))
  const pdfItem = noaPage.locator('article').nth(1)
  await pdfItem.scrollIntoViewIfNeeded() // pictures load when they come into view
  await pdfItem.locator('img[alt="תווים (עמוד 1)"]').waitFor()
  check('a PDF is shown as a small picture of its first page', (await pdfItem.locator('text=PDF, 1 עמודים').count()) === 1)
  await pdfItem.locator('button[aria-label="הגדלת התווים"]').click()
  await noaPage.waitForSelector('[role=dialog] img[alt="עמוד 1"]')
  check('and the large view shows its pages', true)
  await noaPage.click('[role=dialog] button:has-text("סגירה")')
  await noaPage.waitForSelector('[role=dialog]', { state: 'detached' })
  await noaPage.locator('article').first().locator('button[aria-label="הגדלת התווים"]').click()
  await noaPage.waitForSelector('[role=dialog] img[alt="תווים בגדול"]')
  const newWindow = noaPage.locator('[role=dialog] a:has-text("פתיחה בחלון חדש")')
  check('tapping the small picture opens a large view with an "open in a new window" link', (await newWindow.getAttribute('target')) === '_blank' && (await newWindow.getAttribute('href')).startsWith('blob:'))
  await noaPage.click('[role=dialog] img[alt="תווים בגדול"]')
  check('and tapping the large picture zooms in', (await noaPage.locator('[role=dialog] img').getAttribute('class')).includes('250%'))
  await noaPage.click('[role=dialog] button:has-text("סגירה")')
  await noaPage.waitForSelector('[role=dialog]', { state: 'detached' })
  await shot(noaPage, '45-student-assignment-open')

  // ---------- practice: timer, metronome, backing track, status ----------
  const assignmentId = noaPage.url().split('/').pop()
  const listDocs = async (path) => {
    const r = await fetch(`${fsHost}/v1/projects/${PROJECT}/databases/(default)/documents/${path}?pageSize=50`, { headers: { Authorization: 'Bearer owner' } })
    return (await r.json()).documents ?? []
  }
  await noaPage.waitForSelector('[aria-label="טיימר תרגול"]')
  await noaPage.click('button:has-text("התחלתי לתרגל")')
  await noaPage.waitForSelector('[data-testid=practice-clock]')
  await noaPage.waitForTimeout(2500)
  // the screen turns off: the app is hidden for 3 seconds, and those seconds do not count
  await noaPage.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await noaPage.waitForTimeout(3000)
  await noaPage.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await noaPage.waitForTimeout(1500)
  const clockSeconds = async () => {
    const [m, sec] = (await noaPage.locator('[data-testid=practice-clock]').innerText()).split(':').map(Number)
    return m * 60 + sec
  }
  const counted = await clockSeconds()
  check('the timer does not count the time the screen was off', counted >= 3 && counted <= 5, String(counted))
  await noaPage.click('button:has-text("סיימתי")')
  await noaPage.waitForSelector('text=תרגול קצר מ-10 שניות לא נשמר')
  check('a mis-tap (under 10 seconds) is not saved', (await listDocs('practiceLogs')).length === 0)

  await noaPage.click('button:has-text("התחלתי לתרגל")')
  await noaPage.waitForTimeout(11500)
  await noaPage.click('button:has-text("סיימתי")')
  await noaPage.waitForSelector('text=/✓ נשמר: 00:1\\d/')
  check('the saved message is just the time, like 00:12', true)
  const logs = await listDocs('practiceLogs')
  const log = logs[0]?.fields
  check('a practice session is saved with seconds, for this student, teacher and assignment', logs.length === 1 && Number(log.seconds.integerValue) >= 11 && log.studentId.stringValue === noaUid && log.assignmentId.stringValue === assignmentId, JSON.stringify(log))
  await shot(noaPage, '51-practice-saved')

  // an unfinished session (the app was closed) is offered the next time
  await noaPage.evaluate(([uid, aid]) => {
    const now = Date.now()
    localStorage.setItem('etunley-practice-sessions', JSON.stringify({ [aid]: { uid, assignmentId: aid, state: { startedAt: now - 400000, accumulatedMs: 300000, runningSince: null, savedAt: now - 60000 } } }))
  }, [noaUid, assignmentId])
  await noaPage.reload()
  await noaPage.waitForSelector('text=היה תרגול שלא הסתיים: 05:00')
  await noaPage.click('button:has-text("כן, לשמור")')
  await noaPage.waitForSelector('text=✓ נשמר: 05:00')
  check('an unfinished practice session can be saved', (await listDocs('practiceLogs')).length === 2)
  const totalsText = await noaPage.locator('[data-testid=practice-totals]').innerText()
  check('the sessions add up: today and in total for this assignment', /היום: 05:1\d/.test(totalsText) && /בסך הכול במטלה: 05:1\d/.test(totalsText), totalsText)

  // the metronome shows the teacher tempo, the student can change it
  const firstItem = noaPage.locator('article').first()
  await firstItem.locator('text=המורה ביקשה: 80').waitFor()
  check('the metronome starts at the teacher tempo', (await firstItem.locator('[aria-label="פעימות בדקה"]').innerText()) === '80')
  await firstItem.locator('[aria-label="להאיץ ב-1"]').click()
  check('the student can change the tempo with the + button', (await firstItem.locator('[aria-label="פעימות בדקה"]').innerText()) === '81')
  await firstItem.locator('[aria-label="קצב המטרונום"]').fill('100')
  check('and with the bar', (await firstItem.locator('[aria-label="פעימות בדקה"]').innerText()) === '100')
  await firstItem.locator('text=חזרה לקצב של המורה (80)').click()
  check('and go back to the teacher tempo', (await firstItem.locator('[aria-label="פעימות בדקה"]').innerText()) === '80')
  const secondItem = noaPage.locator('article').nth(1)
  check('an item without a tempo gets a metronome at 60 and no reminder', (await secondItem.locator('[aria-label="פעימות בדקה"]').innerText()) === '60' && (await secondItem.locator('text=המורה ביקשה').count()) === 0)

  // backing track and metronome never play together
  await firstItem.locator('button[aria-label="ניגון הליווי"]:not([disabled])').click()
  await firstItem.locator('button[aria-label="עצירת הליווי"]').waitFor()
  await firstItem.locator('[aria-label="מקום בליווי"]').waitFor()
  check('the backing track has a position bar and 10-second buttons', (await firstItem.locator('[aria-label="10 שניות אחורה"]').count()) === 1 && (await firstItem.locator('[aria-label="10 שניות קדימה"]').count()) === 1)
  await firstItem.locator('[aria-label="10 שניות קדימה"]').click()
  await firstItem.locator('[aria-label="10 שניות אחורה"]').click()
  check('the backing track plays and can be stopped', true)
  await firstItem.locator('button:has-text("הפעלת המטרונום")').click()
  await firstItem.locator('button:has-text("עצירת המטרונום")').waitFor()
  await firstItem.locator('button[aria-label="ניגון הליווי"]').waitFor()
  check('starting the metronome stops the backing track', true)
  await firstItem.locator('button[aria-label="ניגון הליווי"]').click()
  await firstItem.locator('button:has-text("הפעלת המטרונום")').waitFor()
  check('and starting the backing track stops the metronome', true)
  await firstItem.locator('button[aria-label="עצירת הליווי"]').click()

  // status per item
  check('every item starts as "working on it"', (await firstItem.locator('button[aria-pressed=true]').innerText()) === 'עובד/ת על זה')
  await firstItem.locator('button:has-text("מוכן!")').click()
  await firstItem.locator('button[aria-pressed=true]:has-text("מוכן!")').waitFor()
  await noaPage.waitForTimeout(500)
  const itemDocs = await listDocs(`assignments/${assignmentId}/items`)
  check('the status is saved on the item', itemDocs.some((d) => d.fields.status.stringValue === 'ready'))
  await noaPage.reload()
  await noaPage.locator('article').first().locator('button[aria-pressed=true]:has-text("מוכן!")').waitFor()
  check('and is still there after a reload', true)
  await shot(noaPage, '52-student-item-controls')

  // ---------- recording ----------
  const itemPath = (id) => `assignments/${assignmentId}/items/${id}`
  const itemDocs2 = await listDocs(`assignments/${assignmentId}/items`)
  const firstItemId = itemDocs2.find((d) => d.fields.title.stringValue === 'הסולם').name.split('/').pop()
  const secondItemId = itemDocs2.find((d) => d.fields.title.stringValue === 'האטיוד').name.split('/').pop()
  const recordingOf = async (id) => (await listDocs(`assignments/${assignmentId}/items`)).find((d) => d.name.endsWith('/' + id))?.fields.recording?.mapValue.fields
  const objectExists = async (path) => (await fetch(`http://127.0.0.1:9199/v0/b/${PROJECT}.firebasestorage.app/o/${encodeURIComponent(path)}`, { headers: { Authorization: 'Bearer owner' } })).status === 200
  const rec = firstItem.locator('section[aria-label="הקלטה"]')
  await rec.locator('button:has-text("● הקלטה")').waitFor()
  check('every item has a record button', true)

  // record with the metronome; the backing track cannot be played meanwhile
  await rec.locator('input[type=checkbox]').check()
  await rec.locator('button:has-text("● הקלטה")').click()
  await rec.locator('[data-testid=recording-countdown]').waitFor()
  check('a recording starts with a visible countdown from three minutes', /0[23]:[0-5]\d/.test(await rec.locator('[data-testid=recording-countdown]').innerText()))
  await firstItem.locator('button:has-text("עצירת המטרונום")').waitFor()
  check('"record with a metronome" starts the metronome', true)
  check('the backing track cannot be played while recording', await firstItem.locator('button[aria-label="ניגון הליווי"]').isDisabled())
  const clicksBefore = await noaPage.evaluate(() => window.__etunleyClicks ?? 0)
  await noaPage.waitForTimeout(6500)
  const clicksDuring = (await noaPage.evaluate(() => window.__etunleyClicks ?? 0)) - clicksBefore
  check('the metronome keeps clicking during the whole recording (about 8 clicks in 6.5 seconds at 75)', clicksDuring >= 6, String(clicksDuring))
  check('and is still on when the recording is stopped', (await firstItem.locator('button:has-text("עצירת המטרונום")').count()) === 1)
  await rec.locator('button:has-text("■ עצירה")').click()
  await rec.locator('audio').waitFor()
  await firstItem.locator('button:has-text("הפעלת המטרונום")').waitFor()
  check('stopping ends the metronome too, and the new recording can be heard before sending', true)
  check('nothing was uploaded before the student taps send', (await recordingOf(firstItemId)) === undefined)
  await rec.locator('button:has-text("שליחה למורה")').click()
  await rec.locator('text=✓ נשלח למורה').waitFor()
  const firstRecording = await recordingOf(firstItemId)
  check('a recording is saved on the item and in storage', Boolean(firstRecording) && firstRecording.path.stringValue === `recordings/${noaUid}/${assignmentId}/${firstItemId}` && Number(firstRecording.durationSeconds.integerValue ?? firstRecording.durationSeconds.doubleValue) >= 2 && (await objectExists(firstRecording.path.stringValue)), JSON.stringify(firstRecording))
  await noaPage.waitForTimeout(3500)
  check('the server check keeps a real recording', Boolean(await recordingOf(firstItemId)) && (await objectExists(`recordings/${noaUid}/${assignmentId}/${firstItemId}`)))

  // a second recording asks before replacing; cancelling keeps the old one
  await rec.locator('button:has-text("● הקלטה חדשה")').click()
  await rec.locator('[data-testid=recording-countdown]').waitFor()
  await noaPage.waitForTimeout(1500)
  await rec.locator('button:has-text("■ עצירה")').click()
  await rec.locator('button:has-text("שליחה למורה")').click()
  await rec.locator('text=כבר יש הקלטה לפריט הזה. להחליף אותה בהקלטה החדשה? ההקלטה הקודמת תימחק.').waitFor()
  check('replacing asks for confirmation with the agreed text', true)
  await rec.locator('button:has-text("לבטל")').click()
  await noaPage.waitForTimeout(500)
  check('cancelling keeps the old recording untouched', (await recordingOf(firstItemId)).uploadedAt.timestampValue === firstRecording.uploadedAt.timestampValue)
  await rec.locator('button:has-text("● הקלטה חדשה")').click()
  await rec.locator('[data-testid=recording-countdown]').waitFor()
  await noaPage.waitForTimeout(1500)
  await rec.locator('button:has-text("■ עצירה")').click()
  await rec.locator('button:has-text("שליחה למורה")').click()
  await rec.locator('button:has-text("להחליף")').click()
  await rec.locator('text=✓ נשלח למורה').waitFor()
  check('confirming replaces the recording', (await recordingOf(firstItemId)).uploadedAt.timestampValue !== firstRecording.uploadedAt.timestampValue)

  // a second item: record, then delete with the small button
  const rec2 = noaPage.locator('article').nth(1).locator('section[aria-label="הקלטה"]')
  await rec2.locator('button:has-text("● הקלטה")').click()
  await rec2.locator('[data-testid=recording-countdown]').waitFor()
  await noaPage.waitForTimeout(1500)
  await rec2.locator('button:has-text("■ עצירה")').click()
  await rec2.locator('button:has-text("שליחה למורה")').click()
  await rec2.locator('text=✓ נשלח למורה').waitFor()
  await rec2.locator('button:has-text("מחיקת ההקלטה")').click()
  await rec2.locator('button:has-text("כן, למחוק")').click()
  await rec2.locator('text=למחוק את ההקלטה?').waitFor({ state: 'detached' })
  await noaPage.waitForTimeout(500)
  check('the student can delete a recording (the file and the mark)', (await recordingOf(secondItemId)) === undefined && !(await objectExists(`recordings/${noaUid}/${assignmentId}/${secondItemId}`)))
  void itemPath
  await shot(noaPage, '55-recording')

  // a minor whose parent has not approved sees the lock instead of the record button
  // (an adult without consent would be sent to onboarding, so the profile is made a minor for this check)
  const patchProfile = (minor, consent) => fetch(`${fsHost}/v1/projects/${PROJECT}/databases/(default)/documents/users/${noaUid}?updateMask.fieldPaths=consentAt&updateMask.fieldPaths=isMinor`, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { isMinor: { booleanValue: minor }, ...(consent ? { consentAt: { timestampValue: consent } } : {}) } }),
  })
  const consentBefore = (await profileOf(noaUid)).consentAt
  await patchProfile(true, null)
  await noaPage.reload()
  await noaPage.waitForSelector('text=ההקלטות ייפתחו אחרי שההורה יאשר במייל')
  check('without consent there is no record button, only the lock message', (await noaPage.locator('button:has-text("● הקלטה")').count()) === 0)
  await patchProfile(false, consentBefore)
  await noaPage.reload()
  await noaPage.locator('button:has-text("● הקלטה")').first().waitFor()

  // the home list: status next to the title, practice time next to the daily goal
  await noaPage.goto(`${BASE}/student`)
  await noaPage.waitForSelector('[data-testid=assignment-status]')
  const row = noaPage.locator('a:has-text("סולם סול מז׳ור")').first()
  const rowText = await row.innerText()
  check('the home list shows how many items are ready, and today\'s practice (just the time) next to the daily goal, with no tick before the goal is reached', rowText.includes('עובד/ת על זה · 1/2') && /יעד יומי: 15 דקות\s*·\s*05:1\d/.test(rowText) && (await row.locator('[data-testid=goal-reached]').count()) === 0, rowText)
  // reaching the daily goal: a tick appears next to it (a 10-minute session is added so today's total passes 15 minutes)
  const now = new Date().toISOString()
  const seededLog = await fetch(`${fsHost}/v1/projects/${PROJECT}/databases/(default)/documents/practiceLogs?documentId=seeded1`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {
      studentId: { stringValue: noaUid }, teacherId: { stringValue: (await profileOf(noaUid)).teacherId }, assignmentId: { stringValue: assignmentId },
      seconds: { integerValue: '600' }, startedAt: { timestampValue: now }, endedAt: { timestampValue: now },
    } }),
  })
  check('(setup) a 10-minute session was added', seededLog.ok)
  await noaPage.goto(`${BASE}/student`)
  await noaPage.locator('[data-testid=goal-reached]').waitFor()
  check('when today\'s practice reaches the daily goal a tick appears next to it', /15:1\d/.test(await noaPage.locator('[data-testid=practice-today]').first().innerText()))
  await noaPage.locator('a:has-text("סולם סול מז׳ור")').first().click()
  await noaPage.locator('article').nth(1).locator('button:has-text("מוכן!")').click()
  await noaPage.locator('article').nth(1).locator('button[aria-pressed=true]:has-text("מוכן!")').waitFor()
  await noaPage.waitForTimeout(500)
  await noaPage.goto(`${BASE}/student`)
  await noaPage.locator('[data-testid=assignment-status]:has-text("מוכן!")').waitFor()
  check('when every item is ready the title says "ready"', true)
  await shot(noaPage, '54-student-home-list')
  await noaPage.locator('a:has-text("סולם סול מז׳ור")').first().click()
  await noaPage.waitForSelector('[aria-label="טיימר תרגול"]')

  // ---------- the teacher's screen: new recordings, listening, replies, practice ----------
  await danaPage.goto(`${BASE}/teacher`)
  await danaPage.waitForSelector('[data-testid=student-waiting]')
  const homeText = await danaPage.locator('main').innerText()
  check('the teacher home says a recording is waiting, in the list and on the student', homeText.includes('הקלטות שמחכות להאזנה (1)') && (await danaPage.locator('[data-testid=student-waiting]').innerText()) === 'הקלטה חדשה', homeText)
  const practiceText = await danaPage.locator('[data-testid=student-practice]').first().innerText()
  check('and shows each student practice today, this week and the streak', /היום 1[5-9]:\d\d/.test(practiceText) && /השבוע/.test(practiceText) && /רצף 1 יום/.test(practiceText), practiceText)
  await shot(danaPage, '56-teacher-home-waiting')
  await danaPage.click('#waiting-title ~ a')
  await danaPage.waitForSelector('[data-testid=new-recording]')
  check('opening it leads to the assignment, with a "new" mark on the recording', (await danaPage.locator('[data-testid=item-status]').first().innerText()) === 'מוכן!')
  await shot(danaPage, '57-teacher-assignment')
  await danaPage.locator('button:has-text("האזנה להקלטה")').click()
  await danaPage.locator('audio').waitFor()
  await danaPage.evaluate(() => document.querySelector('audio').play())
  await danaPage.waitForSelector('[data-testid=new-recording]', { state: 'detached' })
  check('listening takes the "new" mark away', true)
  await danaPage.waitForTimeout(1500)
  check('and removes the alert (nothing waits any more)', (await listDocs('recordingAlerts')).length === 0)
  await danaPage.fill('input[aria-label="תגובה קצרה"]', 'כל הכבוד! עוד פעם בקצב איטי יותר')
  await danaPage.click('button:has-text("שליחה")')
  await danaPage.waitForSelector('text=כל הכבוד! עוד פעם בקצב איטי יותר')
  const replies = await listDocs(`assignments/${assignmentId}/items/${firstItemId}/comments`)
  check('a short reply is saved on the item, unread by the student', replies.length === 1 && replies[0].fields.readAt.nullValue === null && replies[0].fields.text.stringValue.startsWith('כל הכבוד'))
  await danaPage.click('button:has-text("עריכה")')
  await danaPage.fill('input[aria-label="עריכת התגובה"]', 'כל הכבוד! ממשיכים')
  await danaPage.click('button:has-text("שמירה")')
  await danaPage.waitForSelector('text=כל הכבוד! ממשיכים')
  check('the teacher can edit her reply', true)

  // the student sees the reply: a "new" mark on the home list, and on the item until read
  for (let i = 0; i < 40 && (await listDocs('replyAlerts')).length === 0; i++) await danaPage.waitForTimeout(250)
  check('a Function keeps one alert for the unread reply', (await listDocs('replyAlerts')).length === 1)
  await noaPage.goto(`${BASE}/student`)
  await noaPage.waitForSelector('[data-testid=new-reply-badge]')
  check('the student home marks the assignment with the new teacher reply', true)
  await noaPage.waitForSelector('[data-testid=new-reply-card]')
  check('and shows a card on top with the reply text', (await noaPage.locator('[data-testid=new-reply-card]').innerText()).includes('כל הכבוד! ממשיכים'))
  await noaPage.waitForSelector('[data-testid=today-progress]')
  check('the home shows today\'s progress against the goal and the streak', (await noaPage.locator('[data-testid=today-progress]').innerText()).length > 0 && (await noaPage.locator('[data-testid=streak]').innerText()).includes('רצף'))
  await noaPage.click('a:has-text("סולם סול מז׳ור")')
  await noaPage.waitForSelector('[data-testid=new-reply]')
  check('the student sees the reply, marked "new"', (await noaPage.locator('section[aria-label="תגובות המורה"]').innerText()).includes('כל הכבוד! ממשיכים'))
  await noaPage.goto(`${BASE}/student`)
  await noaPage.waitForSelector('text=המטלות שלי')
  await noaPage.waitForSelector('[data-testid=new-reply-badge]', { state: 'detached' })
  check('after reading it the "new" mark on the home is gone', true)
  check('and so is the card on top', (await noaPage.locator('[data-testid=new-reply-card]').count()) === 0)
  await danaPage.goto(`${BASE}/teacher`)
  await danaPage.waitForSelector('text=התלמידים שלי (1)')
  check('the home no longer shows a waiting recording', (await danaPage.locator('[data-testid=student-waiting]').count()) === 0 && !(await danaPage.locator('main').innerText()).includes('הקלטות שמחכות'))
  await danaPage.click('a:has-text("נועה כהן")')
  await danaPage.waitForSelector('[data-testid=practice-line]')
  await danaPage.waitForSelector('[data-testid=goal-reached]')
  check('the student page shows the practice line and, per assignment, the status and today\'s practice with the goal tick', (await danaPage.locator('[data-testid=practice-line]').innerText()).includes('רצף') && (await danaPage.locator('[data-testid=goal-reached]').count()) === 1, (await danaPage.locator('[data-testid=practice-line]').innerText()) + ' goal=' + (await danaPage.locator('[data-testid=goal-reached]').count()))

  // the teacher edits it
  await danaPage.click('a:has-text("סולם סול מז׳ור")')
  await danaPage.click('a:has-text("עריכת המטלה")')
  await danaPage.waitForSelector('text=עריכת מטלה')
  check('editing shows what she wrote and the file that is attached', (await danaPage.inputValue('#title')) === 'סולם סול מז׳ור' && (await danaPage.locator('text=יש קובץ תווים').count()) === 2)
  check('the editing page does not repeat the link to the student view', (await danaPage.locator('a:has-text("איך זה נראה אצל התלמיד/ה")').count()) === 0)
  await danaPage.goBack()
  await danaPage.click('a:has-text("איך זה נראה אצל התלמיד/ה")')
  await danaPage.waitForSelector('text=כך המסך נראה לתלמיד/ה')
  check('the teacher sees the student screen: timer locked, metronome and the status the student marked', (await danaPage.locator('button:has-text("התחלתי לתרגל")').isDisabled()) && (await danaPage.locator('text=המורה ביקשה: 80').count()) === 1 && (await danaPage.locator('article').first().locator('button[aria-pressed=true]').innerText()) === 'מוכן!')
  check('and cannot change the status there', await danaPage.locator('article').first().locator('button:has-text("עובד/ת על זה")').isDisabled())
  await shot(danaPage, '53-teacher-preview')
  await danaPage.click('a:has-text("למטלה")')
  await danaPage.click('a:has-text("עריכת המטלה")')
  await danaPage.waitForSelector('text=עריכת מטלה')
  await danaPage.fill('#title', 'סולם סול מז׳ור ושיר')
  await danaPage.locator('fieldset:has-text("פריט 2") >> text=הסרת הפריט').click()
  await danaPage.click('button:has-text("שמירה")')
  await danaPage.waitForSelector('h1:has-text("סולם סול מז׳ור ושיר")')
  await danaPage.click('a:has-text("לתלמיד/ה")')
  await danaPage.waitForSelector('a:has-text("סולם סול מז׳ור ושיר")')
  await noaPage.goto(`${BASE}/student`)
  await noaPage.waitForSelector('a:has-text("סולם סול מז׳ור ושיר")')
  await noaPage.click('a:has-text("סולם סול מז׳ור ושיר")')
  await noaPage.waitForSelector('text=הסולם')
  check('the edit reaches the student: new title, one item removed', (await noaPage.locator('main').innerText()).includes('האטיוד') === false)

  // ---------- the teacher's area: templates ----------
  check('the teacher list has a link under each assignment to see it as the student sees it', (await danaPage.locator('a:has-text("איך זה נראה אצל התלמיד/ה")').count()) >= 1)
  await danaPage.click('a:has-text("סולם סול מז׳ור ושיר")')
  await danaPage.click('a:has-text("עריכת המטלה")')
  await danaPage.waitForSelector('text=עריכת מטלה')
  await danaPage.click('button:has-text("שמירה כתבנית")')
  await danaPage.waitForSelector('text=✓ נשמרה כתבנית')
  check('the assignment is saved as a template', true)
  await danaPage.goto(`${BASE}/teacher`)
  await danaPage.waitForSelector('nav[aria-label="אזורי המורה"] a')
  const tabTexts = (await danaPage.locator('nav[aria-label="אזורי המורה"] a').allInnerTexts()).join('|')
  check('the teacher home has three areas', tabTexts === 'התלמידים שלי|איזור המורה שלי|הגדרות', tabTexts)
  await shot(danaPage, '46-teacher-students-tab')
  await danaPage.click('nav[aria-label="אזורי המורה"] >> text=איזור המורה שלי')
  await danaPage.waitForSelector('a:has-text("סולם סול מז׳ור ושיר")')
  check('the template is listed in the teacher area with its daily goal', (await danaPage.locator('a:has-text("סולם סול מז׳ור ושיר")').innerText()).includes('יעד יומי: 15 דקות'))
  await shot(danaPage, '47-teacher-area')

  // open the template, see what is in it
  await danaPage.click('a:has-text("סולם סול מז׳ור ושיר")')
  await danaPage.waitForSelector('text=שיוך לתלמידים')
  check('a template opens and shows its items', (await danaPage.locator('main').innerText()).includes('הסולם') && (await danaPage.locator('main').innerText()).includes('לאט, עם מטרונום'))
  await danaPage.waitForSelector('img[alt="תווים"]')
  check('the template sheet music opens', true)
  check('assign stays locked until a student is ticked', await danaPage.locator('button:has-text("שיוך")').first().isDisabled())
  await shot(danaPage, '48-template-page')
  await danaPage.check('label:has-text("נועה כהן") input')
  await danaPage.selectOption('#assign-week', { label: 'שבוע הבא' })
  await danaPage.click('button:has-text("שיוך (1)")')
  await danaPage.waitForSelector('text=✓ המטלה נוספה ל: נועה כהן')
  check('the template is given to the ticked student for next week', true)

  await noaPage.goto(`${BASE}/student`)
  await noaPage.waitForSelector('h3:has-text("שבוע הבא")')
  await noaPage.click('section:has(h3:has-text("שבוע הבא")) a')
  await noaPage.waitForSelector('text=לאט, עם מטרונום')
  await noaPage.waitForSelector('img[alt="תווים"]')
  await noaPage.locator('[aria-label="ניגון הליווי"]').first().waitFor()
  check('the student sees it, with its own copy of the sheet music and the backing track', true)
  // slow network: the play button waits (disabled) until the track is loaded, and nothing starts by itself
  await noaPage.route('**/v0/b/**alt=media**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await route.continue()
  })
  await noaPage.reload()
  const slowItem = noaPage.locator('article').first()
  const playButton = slowItem.locator('[aria-label="ניגון הליווי"]')
  await playButton.waitFor()
  check('while the backing track loads, its play button is disabled', await playButton.isDisabled())
  await slowItem.locator('button:has-text("הפעלת המטרונום")').click()
  await noaPage.waitForTimeout(3500)
  check('a backing track that finishes loading after the metronome started does not play over it', (await slowItem.locator('button:has-text("עצירת המטרונום")').count()) === 1 && (await slowItem.locator('[aria-label="עצירת הליווי"]').count()) === 0 && !(await playButton.isDisabled()))
  await slowItem.locator('button:has-text("עצירת המטרונום")').click()
  await noaPage.unroute('**/v0/b/**alt=media**')

  // editing the template keeps what was not changed
  await danaPage.goto(`${BASE}/teacher/area`)
  await danaPage.click('a:has-text("סולם סול מז׳ור ושיר")')
  await danaPage.click('a:has-text("עריכת התבנית")')
  await danaPage.waitForSelector('text=עריכת תבנית')
  check('editing a template shows its content and its sheet music', (await danaPage.inputValue('#title')) === 'סולם סול מז׳ור ושיר' && (await danaPage.locator('text=יש קובץ תווים').count()) === 1)
  await danaPage.fill('#title', 'תבנית למתחילים')
  await danaPage.click('button:has-text("שמירה")')
  await danaPage.waitForSelector('h1:has-text("תבנית למתחילים")')
  await danaPage.waitForSelector('img[alt="תווים"]')
  check('after editing, the new title is shown and the sheet music is still there', true)

  // a new assignment from a template (the chooser in the assignment form)
  await danaPage.goto(`${BASE}/teacher`)
  await danaPage.click('a:has-text("נועה כהן")')
  await danaPage.click('a:has-text("מטלה חדשה")')
  await danaPage.waitForSelector('#template')
  await danaPage.selectOption('#template', { label: 'תבנית למתחילים' })
  await danaPage.waitForFunction(() => document.querySelector('#title')?.value === 'תבנית למתחילים')
  check('picking a template in a new assignment fills the form, including the sheet music', (await danaPage.locator('text=יש קובץ תווים').count()) === 1)
  await danaPage.click('a:has-text("חזרה"), a:has-text("לתלמיד/ה")')

  // a brand-new template from the teacher area
  await danaPage.goto(`${BASE}/teacher/area`)
  await danaPage.click('a:has-text("+ תבנית חדשה")')
  await danaPage.waitForSelector('text=תבנית חדשה')
  check('the template form has no week choice', (await danaPage.locator('#week').count()) === 0)
  await danaPage.fill('#title', 'סולם מי במול')
  await danaPage.fill('input[aria-label="שם פריט 1"]', 'סולם')
  await danaPage.click('button:has-text("שמירה")')
  await danaPage.waitForSelector('a:has-text("סולם מי במול")')
  check('a new template can be created straight from the teacher area', true)

  // deleting a template does not touch assignments made from it
  await danaPage.click('a:has-text("תבנית למתחילים")')
  await danaPage.click('text=מחיקת התבנית')
  await danaPage.click('button:has-text("כן, למחוק")')
  await danaPage.waitForSelector('a:has-text("סולם מי במול")')
  check('a template can be deleted', (await danaPage.locator('a:has-text("תבנית למתחילים")').count()) === 0)
  await noaPage.goto(`${BASE}/student`)
  await noaPage.click('section:has(h3:has-text("שבוע הבא")) a')
  await noaPage.waitForSelector('img[alt="תווים"]')
  check('assignments made from the deleted template keep their sheet music', true)

  // ---------- the owner removes a file ----------
  await owner.goto(`${BASE}/admin`)
  await owner.waitForSelector('article:has-text("דנה המורה")')
  check('the approved teacher shows how many students are connected', (await owner.locator('article:has-text("דנה המורה")').innerText()).includes('1 תלמידים'))
  await owner.click('article:has-text("דנה המורה") button[aria-expanded]')
  await owner.waitForSelector('text=scale.png')
  await owner.waitForSelector('article:has-text("דנה המורה") >> text=נועה כהן')
  check('opening a teacher lists her connected students', (await owner.locator('article:has-text("דנה המורה")').innerText()).includes('נועה כהן'))
  await owner.click('article:has-text("דנה המורה") div.bg-white:has-text("scale.png") >> text=הצגת הקובץ >> nth=0')
  await owner.waitForSelector('img[alt="הקובץ שהמורה העלתה"]')
  check('the owner can look at an uploaded file', true)
  await owner.click('article:has-text("דנה המורה") div.bg-white:has-text("backing.mp3") >> text=הצגת הקובץ >> nth=0')
  await owner.waitForSelector('audio[controls]')
  check('and listen to an uploaded backing track', true)
  const fileRows = owner.locator('article:has-text("דנה המורה") div.bg-white')
  const filesBefore = await fileRows.count()
  check('the owner sees the teacher files with their original names and where they are used', filesBefore >= 2 && (await owner.locator('article:has-text("דנה המורה")').innerText()).includes('בשימוש: מטלה'))
  await shot(owner, '49-admin-files')
  await owner.locator('article:has-text("דנה המורה") div.bg-white:has-text("בשימוש: מטלה") >> text=הסרת הקובץ').first().click()
  await owner.click('button:has-text("כן, להסיר")')
  await owner.waitForFunction((n) => document.querySelectorAll('article div.bg-white').length === n, filesBefore - 1)
  check('removing a file takes it off the list', true)

  // ---------- the teacher deletes an assignment ----------
  await danaPage.goto(`${BASE}/teacher`)
  await danaPage.click('a:has-text("נועה כהן")')
  await danaPage.waitForSelector('h3:has-text("שבוע הבא")')
  await danaPage.click('section:has(h3:has-text("שבוע הבא")) a')
  await danaPage.click('a:has-text("עריכת המטלה")')
  await danaPage.waitForSelector('text=עריכת מטלה')
  await danaPage.click('text=מחיקת המטלה')
  await danaPage.waitForSelector('text=למחוק את המטלה?')
  await shot(danaPage, '50-delete-assignment')
  await danaPage.click('button:has-text("כן, למחוק")')
  await danaPage.waitForSelector('text=מטלה חדשה')
  await danaPage.waitForFunction(() => !document.querySelector('h3')?.textContent?.includes('שבוע הבא'))
  check('the deleted assignment is gone from the teacher list', (await danaPage.locator('h3:has-text("שבוע הבא")').count()) === 0)
  await noaPage.goto(`${BASE}/student`)
  await noaPage.waitForSelector('a:has-text("סולם סול מז׳ור ושיר")')
  check('and from the student list', (await noaPage.locator('h3:has-text("שבוע הבא")').count()) === 0)

  // ---------- an assignment of a previous teacher is not shown ----------
  const seeded = await fetch(`${fsHost}/v1/projects/${PROJECT}/databases/(default)/documents/assignments?documentId=oldteacher1`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {
      teacherId: { stringValue: 'someOldTeacher' }, studentId: { stringValue: noaUid }, title: { stringValue: 'מטלה ממורה קודמת' },
      dailyGoalMinutes: { integerValue: '10' }, weekStart: { timestampValue: new Date().toISOString() },
    } }),
  })
  check('(setup) an assignment of an older teacher exists for the student', seeded.ok)
  await noaPage.goto(`${BASE}/student`)
  await noaPage.waitForSelector('a:has-text("סולם סול מז׳ור ושיר")')
  check('the student home shows only the current teacher assignments', (await noaPage.locator('a:has-text("מטלה ממורה קודמת")').count()) === 0)
  await noaPage.goto(`${BASE}/student/assignment/oldteacher1`)
  await noaPage.waitForSelector('text=המטלה לא נמצאה')
  check('and opening an old assignment directly says it is not found', true)

  // removing the student
  await danaPage.goto(`${BASE}/teacher`)
  await danaPage.click('a:has-text("נועה כהן")')
  await danaPage.click('text=הסרת התלמיד/ה')
  await danaPage.waitForSelector('text=להסיר את נועה כהן?')
  await danaPage.click('button:has-text("כן")')
  await danaPage.waitForSelector('text=התלמידים שלי (0)')
  const removed = await profileOf(noaUid)
  check('removal clears the link but keeps the student profile', !('teacherId' in removed) && !('linkStatus' in removed) && removed.instrument === 'פסנתר', JSON.stringify(removed))
  await noaPage.reload()
  await noaPage.waitForSelector('text=הצטרפות למורה')
  check('the removed student is asked for a code again', true)


  // ---------- a MINOR: cancel a request, join, parent consent by e-mail ----------
  const yaelUid = await uidOf('yael.new@example.com')
  const yaelPage = await newPage()
  await holdGooglePopup(yaelPage)
  await yaelPage.goto(`${BASE}/login`)
  await yaelPage.click('text=כניסה עם Google')
  await yaelPage.waitForTimeout(500)
  await fakeGoogleSignIn(yaelPage, 'yael.new@example.com', 'יעל')
  await yaelPage.waitForSelector('text=הצטרפות למורה')

  const currentCode = (await profileOf(danaUid)).inviteCode
  await yaelPage.fill('#code', currentCode)
  await yaelPage.click('button:has-text("הצטרפות")')
  await yaelPage.waitForSelector('text=ממתינים לאישור המורה')
  await shot(yaelPage, '27-student-can-cancel')
  await yaelPage.click('text=טעיתי בקוד? ביטול הבקשה')
  await yaelPage.waitForSelector('text=לבטל את הבקשה')
  await yaelPage.click('button:has-text("כן, לבטל")')
  await yaelPage.waitForSelector('text=הצטרפות למורה')
  check('a waiting student can take the request back', !('teacherId' in (await profileOf(yaelUid))))
  await yaelPage.fill('#code', currentCode)
  await yaelPage.click('button:has-text("הצטרפות")')
  await yaelPage.waitForSelector('text=ממתינים לאישור המורה')

  await danaPage.goto(`${BASE}/teacher`)
  await danaPage.waitForSelector('article:has-text("יעל") button:has-text("אישור")')
  await danaPage.click('article:has-text("יעל") button:has-text("אישור")')
  await danaPage.click('button:has-text("כן")')
  await danaPage.waitForSelector('text=התלמידים שלי (1)')
  await danaPage.waitForSelector('text=ממתין לאישור הורה')
  check('on the home list only the minor shows the "waiting for a parent" badge', (await danaPage.locator('text=ממתין לאישור הורה').count()) === 1)
  await danaPage.click('a:has-text("יעל")')
  await danaPage.waitForSelector('input[aria-label="אימייל של ההורה"]')
  await shot(danaPage, '28-teacher-parent-email-box')

  await danaPage.fill('input[aria-label="אימייל של ההורה"]', 'not-an-email')
  await danaPage.click('button:has-text("שליחה")')
  check('the browser itself refuses an invalid address', (await danaPage.locator('text=✓ המייל נשלח').count()) === 0)
  await danaPage.fill('input[aria-label="אימייל של ההורה"]', 'parent@example.com')
  await danaPage.click('button:has-text("שליחה")')
  await danaPage.waitForSelector('text=✓ המייל נשלח')
  check('the teacher sees where it was sent', (await danaPage.locator('main').innerText()).includes('parent@example.com'))
  await shot(danaPage, '29-teacher-consent-sent')

  const outbox = await (await fetch(`${fsHost}/v1/projects/${PROJECT}/databases/(default)/documents/devOutbox?pageSize=50`, { headers: { Authorization: 'Bearer owner' } })).json()
  const mail = outbox.documents.map((d) => d.fields).find((f) => f.to.stringValue === 'parent@example.com')
  const link = mail.text.stringValue.match(/https?:\/\/\S+\/consent\/approve#[A-Za-z0-9_-]+/)[0]
  check('the e-mail is in Hebrew and carries a personal link', mail.subject.stringValue === 'אישור הורה לשימוש באפליקציה' && link.includes('#'))

  // the parent: no account, no sign-in
  const parent = await newPage()
  await parent.goto(link)
  await parent.waitForSelector('text=אישור הורה')
  check('the parent page names the child and the teacher', (await parent.locator('main').innerText()).includes('יעל') && (await parent.locator('main').innerText()).includes('דנה המורה'))
  check('the parent ticks the agreed sentence', await parent.locator('text=אני ההורה/האפוטרופוס ומאשר/ת שיעל ישתמש/תשתמש באפליקציה ושהקלטות התרגול יישמרו וישותפו עם המורה דנה המורה').count() === 1)
  check('approve is locked until a name is written and the box ticked', await parent.locator('button:has-text("אישור")').isDisabled())
  check('opening the link did not approve anything', !('consentAt' in (await profileOf(yaelUid))))
  await shot(parent, '30-parent-page')
  await parent.fill('#parent-name', 'מיכל כהן')
  await parent.check('input[type=checkbox]')
  await parent.click('button:has-text("אישור")')
  await parent.waitForSelector('text=תודה!')
  await shot(parent, '31-parent-thanks')
  const yaelAfter = await profileOf(yaelUid)
  check('the child is now marked as approved by a parent', yaelAfter.consentBy === 'parent' && Boolean(yaelAfter.consentAt), JSON.stringify(yaelAfter))

  await parent.reload()
  await parent.waitForSelector('text=הקישור לא תקין')
  check('the link works only once', true)
  const stranger = await newPage()
  await stranger.goto(`${BASE}/consent/approve#${'A'.repeat(43)}`)
  await stranger.waitForSelector('text=הקישור לא תקין')
  check('a made-up link gives the same message', true)

  await danaPage.reload()
  await danaPage.waitForSelector('text=✓ ההורה אישר')
  check('the teacher now sees: approved', true)
  await yaelPage.reload()
  await yaelPage.waitForSelector('text=✓ ההורה אישר. אפשר להקליט')
  check('and so does the child', true)


  // ---------- privacy page and the sign-up notice ----------
  const visitor = await newPage()
  await visitor.goto(`${BASE}/privacy`)
  await visitor.waitForSelector('text=מדיניות פרטיות')
  const privacyText = await visitor.locator('main').innerText()
  check('the privacy page is public and says recordings are deleted after 12 months', privacyText.includes('12 חודשים') && privacyText.includes('טיוטה'))
  await shot(visitor, '32-privacy')
  await visitor.goto(`${BASE}/signup`)
  await visitor.waitForSelector('text=מי את/ה?')
  check('the sign-up screen tells people about the 12 months and deletion', (await visitor.locator('main').innerText()).includes('נמחקות אוטומטית אחרי 12 חודשים'))

  // ---------- the parent withdraws the consent from the personal manage link ----------
  const outbox2 = await (await fetch(`${fsHost}/v1/projects/${PROJECT}/databases/(default)/documents/devOutbox?pageSize=100`, { headers: { Authorization: 'Bearer owner' } })).json()
  const confirmation = outbox2.documents.map((d) => d.fields).find((f) => f.to.stringValue === 'parent@example.com' && f.subject.stringValue === 'האישור נשמר')
  const manageLink = confirmation.text.stringValue.match(/https?:\/\/\S+\/consent\/manage#[A-Za-z0-9_-]+/)[0]
  check('the parent got a confirmation e-mail with a personal manage link', Boolean(manageLink))
  check('the parent address is no longer kept after approval', !(await fetch(`${fsHost}/v1/projects/${PROJECT}/databases/(default)/documents/parentConsents/${yaelUid}`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json())).fields.parentEmail)

  const manage = await newPage()
  await manage.goto(manageLink)
  await manage.waitForSelector('text=ניהול האישור')
  await shot(manage, '33-parent-manage')
  await manage.click('button:has-text("ביטול האישור")')
  await manage.click('button:has-text("כן, לבטל")')
  await manage.waitForSelector('text=האישור בוטל')
  check('withdrawing removes the consent from the child profile', !('consentAt' in (await profileOf(yaelUid))))
  await yaelPage.reload()
  await yaelPage.waitForSelector('text=ההקלטות ייפתחו אחרי שההורה יאשר במייל')
  check('the child is locked out of recording again', true)
  await danaPage.reload()
  await danaPage.waitForSelector('text=ממתין לאישור הורה')
  check('the teacher sees she must ask the parent again', true)

  // ---------- the owner deletes a person on request ----------
  await owner.goto(`${BASE}/admin`)
  await owner.waitForSelector('[data-testid=delete-request-summary]')
  await owner.click('[data-testid=delete-request-summary]')
  await owner.fill('#delete-email', 'yael.new@example.com')
  await owner.click('button:has-text("חיפוש")')
  await owner.waitForSelector('text=יעל')
  check('the owner finds the person by e-mail and sees name and role', (await owner.locator('details').innerText()).includes('תלמיד/ה'))
  check('delete stays locked until the confirmation word is typed', await owner.locator('button:has-text("מחיקה סופית")').isDisabled())
  await shot(owner, '34-admin-delete')
  await owner.fill('#admin-delete-word', 'מחיקה')
  await owner.click('button:has-text("מחיקה סופית")')
  await owner.waitForSelector('text=✓ נמחק')
  check('the person and the sign-in account are gone', !(await profileOf(yaelUid)) && !(await uidOf('yael.new@example.com')))

  // ---------- a student deletes her own account ----------
  const noaSession = await newPage()
  await noaSession.goto(`${BASE}/login`)
  await noaSession.fill('#email', 'noa@example.com')
  await noaSession.fill('#password', 'brand-new-pass-7')
  await noaSession.click('button[type=submit]')
  await noaSession.waitForSelector('text=הצטרפות למורה')
  await noaSession.click('text=הגדרות ופרטיות')
  await noaSession.waitForSelector('text=מחיקת החשבון שלי')
  await shot(noaSession, '35-settings')
  check('delete stays locked until the word is typed', await noaSession.locator('button:has-text("מחיקה סופית של החשבון")').isDisabled())
  // an old sign-in must ask again (the browser clock is moved 10 minutes forward)
  await noaSession.clock.install({ time: Date.now() + 10 * 60 * 1000 })
  await noaSession.fill('#delete-word', 'מחיקה')
  await noaSession.click('button:has-text("מחיקה סופית של החשבון")')
  await noaSession.waitForSelector('text=כדי להמשיך צריך להיכנס שוב')
  check('an old sign-in is asked for the password again before deleting', true)
  await shot(noaSession, '36-settings-reauth')

  const noaFresh = await newPage()
  await noaFresh.goto(`${BASE}/login`)
  await noaFresh.fill('#email', 'noa@example.com')
  await noaFresh.fill('#password', 'brand-new-pass-7')
  await noaFresh.click('button[type=submit]')
  await noaFresh.waitForSelector('text=הצטרפות למורה')
  await noaFresh.click('text=הגדרות ופרטיות')
  await noaFresh.fill('#delete-word', 'מחיקה')
  await noaFresh.click('button:has-text("מחיקה סופית של החשבון")')
  await noaFresh.waitForSelector('text=החשבון נמחק. תודה שהיית איתנו.')
  check('she lands on the welcome screen with a goodbye note', noaFresh.url().includes('/welcome'))
  check('her profile and her sign-in account are gone', !(await profileOf(noaUid)) && !(await uidOf('noa@example.com')))
  await noaFresh.goto(`${BASE}/login`)
  await noaFresh.fill('#email', 'noa@example.com')
  await noaFresh.fill('#password', 'brand-new-pass-7')
  await noaFresh.click('button[type=submit]')
  await noaFresh.waitForSelector('[role=alert]')
  check('and she can no longer sign in', true)

  // ---------- a teacher deletes her account ----------
  const dana2 = await newPage()
  await holdGooglePopup(dana2)
  await dana2.goto(`${BASE}/login`)
  await dana2.click('text=כניסה עם Google')
  await dana2.waitForTimeout(500)
  await fakeGoogleSignIn(dana2, 'dana.teacher@example.com', 'דנה המורה')
  await dana2.waitForSelector('text=התלמידים שלי')
  const codeBefore = (await profileOf(danaUid)).inviteCode
  await dana2.click('nav[aria-label="אזורי המורה"] >> text=הגדרות')
  await dana2.click('text=הגדרות ופרטיות')
  await dana2.waitForSelector('text=התבניות, הקבצים שהעלית')
  await dana2.fill('#delete-word', 'מחיקה')
  await dana2.click('button:has-text("מחיקה סופית של החשבון")')
  await dana2.waitForSelector('text=החשבון נמחק. תודה שהיית איתנו.')
  check('the teacher, her invite code and her sign-in account are gone', !(await profileOf(danaUid)) && !(await uidOf('dana.teacher@example.com')))
  const codeDoc = await fetch(`${fsHost}/v1/projects/${PROJECT}/databases/(default)/documents/inviteCodes/${codeBefore}`, { headers: { Authorization: 'Bearer owner' } })
  check('the old invite code does not exist any more', codeDoc.status === 404)

} finally {
  await browser.close()
  server.kill()
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
