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
  await danaPage.waitForSelector('text=מטלה חדשה')
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
  await danaPage.setInputFiles('input[type=file]', { name: 'scale.png', mimeType: 'image/png', buffer: tinyPng })
  await danaPage.waitForSelector('text=נבחר: scale.png')
  await danaPage.click('button:has-text("+ הוספת פריט")')
  await danaPage.fill('input[aria-label="שם פריט 2"]', 'האטיוד')
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
  await noaPage.click('button:has-text("הצגת התווים")')
  await noaPage.waitForSelector('img[alt="תווים"]')
  check('the sheet music image loads for the student (private file, her own sign-in)', await noaPage.$eval('img[alt="תווים"]', (img) => img.src.startsWith('blob:')))
  await shot(noaPage, '45-student-assignment-open')

  // the teacher edits it
  await danaPage.click('a:has-text("סולם סול מז׳ור")')
  await danaPage.waitForSelector('text=עריכת מטלה')
  check('editing shows what she wrote and the file that is attached', (await danaPage.inputValue('#title')) === 'סולם סול מז׳ור' && (await danaPage.locator('text=יש קובץ תווים').count()) === 1)
  await danaPage.fill('#title', 'סולם סול מז׳ור ושיר')
  await danaPage.locator('fieldset:has-text("פריט 2") >> text=הסרת הפריט').click()
  await danaPage.click('button:has-text("שמירה")')
  await danaPage.waitForSelector('a:has-text("סולם סול מז׳ור ושיר")')
  await noaPage.goto(`${BASE}/student`)
  await noaPage.waitForSelector('a:has-text("סולם סול מז׳ור ושיר")')
  await noaPage.click('a:has-text("סולם סול מז׳ור ושיר")')
  await noaPage.waitForSelector('text=הסולם')
  check('the edit reaches the student: new title, one item removed', (await noaPage.locator('main').innerText()).includes('האטיוד') === false)

  // ---------- the teacher's area: templates ----------
  await danaPage.click('a:has-text("סולם סול מז׳ור ושיר")')
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
  await danaPage.click('button:has-text("הצגת התווים")')
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
  await noaPage.click('button:has-text("הצגת התווים")')
  await noaPage.waitForSelector('img[alt="תווים"]')
  check('the student sees it, with its own copy of the sheet music', true)

  // editing the template keeps what was not changed
  await danaPage.goto(`${BASE}/teacher/area`)
  await danaPage.click('a:has-text("סולם סול מז׳ור ושיר")')
  await danaPage.click('a:has-text("עריכת התבנית")')
  await danaPage.waitForSelector('text=עריכת תבנית')
  check('editing a template shows its content and its sheet music', (await danaPage.inputValue('#title')) === 'סולם סול מז׳ור ושיר' && (await danaPage.locator('text=יש קובץ תווים').count()) === 1)
  await danaPage.fill('#title', 'תבנית למתחילים')
  await danaPage.click('button:has-text("שמירה")')
  await danaPage.waitForSelector('h1:has-text("תבנית למתחילים")')
  await danaPage.click('button:has-text("הצגת התווים")')
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
  await noaPage.click('button:has-text("הצגת התווים")')
  await noaPage.waitForSelector('img[alt="תווים"]')
  check('assignments made from the deleted template keep their sheet music', true)

  // ---------- the owner removes a file ----------
  await owner.goto(`${BASE}/admin`)
  await owner.waitForSelector('article:has-text("דנה המורה")')
  check('the approved teacher shows how many students are connected', (await owner.locator('article:has-text("דנה המורה")').innerText()).includes('1 תלמידים'))
  await owner.click('article:has-text("דנה המורה") button[aria-expanded]')
  await owner.waitForSelector('text=scale.png')
  check('opening a teacher lists her connected students', (await owner.locator('article:has-text("דנה המורה")').innerText()).includes('נועה כהן'))
  await owner.click('article:has-text("דנה המורה") div.bg-white >> text=הצגת הקובץ >> nth=0')
  await owner.waitForSelector('img[alt="הקובץ שהמורה העלתה"]')
  check('the owner can look at an uploaded file', true)
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
