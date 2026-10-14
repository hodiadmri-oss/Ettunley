# Etunley

Hebrew music-practice web app connecting private music teachers with their students.

## How to work with the owner (read first)

- The owner is **not a programmer**. Talk to her in **Hebrew**, in plain language. Avoid jargon; when a technical term is unavoidable, explain it in one sentence.
- Work in **small steps**. After each step, stop and tell her: what you built, how to see it in the browser (exact URL and what to click), and what she should check. Wait for her OK before moving on.
- **Before anything that costs money, touches production, or is hard to undo** (deploying, changing security rules in production, choosing a Firebase region, deleting data, installing a paid extension): explain what it does and why, and ask for explicit approval.
- When something needs to be done by her outside the terminal (Firebase console, Google Cloud billing, DNS, email provider), give numbered click-by-click instructions in Hebrew.
- **Never add features that are not in this file or in the current phase prompt.** If you think something would help, ask first.
- Commit to git after every working step, with a clear English commit message. Never commit secrets (`.env`, service-account keys, API keys for email).
- If you are unsure about a product decision, ask. Do not guess.

## The product

Two problems only:
1. Students don't keep practicing at home.
2. Teachers have no idea what happened between lessons.

One loop: teacher gives a weekly assignment with several practice items → student practices (timer, accompaniment track, metronome), marks a status per item, uploads a recording → teacher listens and replies with short text → student sees the reply on the home screen and comes back tomorrow.

**Users:** mostly children and teenagers, some adults. Private teachers; each student has exactly one teacher. MVP launches with 2–5 teachers the owner knows.

**No notifications of any kind in the MVP** (no push, email reminders, WhatsApp). What brings the student back is the home screen itself: a new teacher reply with a prominent "חדש" badge, plus the streak.

### Out of scope — do not build
AI-generated exercises, music recognition from images or audio, notation rendering (VexFlow/OSMD/MusicXML), synced live ensemble, QR codes, PDF export, focus mode, library, scale catalog, notifications, tempo change or looping in the player, voice replies, multiple children per account, multiple teachers per student.

## Cross-cutting requirements

- **Language:** Hebrew only in the UI, **full RTL** everywhere (`dir="rtl"`, logical CSS properties). Font: Heebo. All UI strings in Hebrew; code, comments, file names and identifiers in English.
- **Mobile first for both roles.** The student uses a phone next to the instrument; the teacher works mostly from a phone, sometimes a computer.
- **Design:** clean, warm, pastel, lots of white space. Student screens calm and uncluttered, one clear primary action per screen. Short, simple texts and large tap targets (some users are kids).
- Gender-inclusive Hebrew where it reads naturally (e.g. "עובד/ת על זה").

## Stack

- React + TypeScript + Vite, Tailwind CSS, shadcn/ui.
- **Firebase** (Blaze plan): Authentication, Cloud Firestore, Cloud Storage for Firebase, Cloud Functions (TypeScript), Firebase Hosting.
- **Firebase Emulator Suite for all local development and testing.** Nothing touches the real project until the owner approves a deploy.
- Email (parental consent only): sent from a Cloud Function through a transactional email provider (default: Resend). API key stored as a Functions secret, never in code.

### Cost safety (Blaze has no hard spending cap)
- A budget alert must exist in Google Cloud billing before the first deploy (walk the owner through it).
- Storage rules enforce file size and type limits (see below).
- Enable Firebase App Check before the first deploy.
- Avoid unbounded Firestore reads: always query with filters and limits; no listeners on whole collections.

## Roles and authentication

- Sign up / sign in with email+password and with Google.
- At sign-up the user picks a role: **מורה** or **תלמיד/ה**. The role is written once and **can never be changed by the client** (enforced in security rules).
- **Teachers need the owner's approval.** A new teacher starts as `teacherStatus: pending` and sees only: "החשבון שלך ממתין לאישור. נעדכן אותך כשהוא יאושר." Until approved, a teacher has no invite code and cannot do anything as a teacher (enforced in rules and Functions, not only in the UI).
- **Owner admin:** the owner's account gets an `admin` custom claim, set once with a script run locally (never from the client). Only an admin can open `/admin`: a simple, mobile-friendly list of pending teachers (name, email, sign-up date) with "לאשר" / "לדחות" buttons, plus the list of approved teachers. Approving calls a Cloud Function that checks the admin claim, sets `teacherStatus: approved`, and creates the teacher's invite code. Rejecting sets `teacherStatus: rejected`. No notifications — the owner checks `/admin` herself.
- **Students are asked for their date of birth** (store the date, not an age). Based on it:
  - **Under 18 (minor):** consent comes from the parent by email — see "Parental consent" below. Until approved, the minor can view assignments and practice, but **cannot record or upload recordings**. Instead of the record button show: "ההקלטות ייפתחו אחרי שההורה יאשר במייל".
  - **18 and over (adult):** the student confirms a required checkbox: "אני מאשר/ת שהקלטות התרגול יישמרו וישותפו רק עם המורה". Store when it was given.
- **Student onboarding:** name, date of birth, instrument, level (מתחיל/בינוני/מתקדם), then the consent step for adults. One screen where possible; save each field as soon as it changes, not only at the end.

### Parental consent (minors)
1. The minor signs up and enters the teacher's invite code like any student.
2. On the teacher's side, next to that student: "ממתין לאישור הורה", an email field for the parent, and a "שליחה" button. **The teacher enters the parent's email.**
3. A Cloud Function sends the parent a Hebrew email with a personal one-time link (valid 7 days). On the link's page the parent enters their name and checks: "אני ההורה/האפוטרופוס ומאשר/ת ש[שם הילד] ישתמש/תשתמש באפליקציה ושהקלטות התרגול יישמרו וישותפו רק עם המורה [שם המורה]". The parent does not need an account.
4. The teacher can resend or fix the email. When the parent approves, the teacher sees "אושר".
5. The token is random, stored only as a hash, single-use, and verified only inside a Cloud Function.

## Teacher–student linking

- Each teacher has a fixed personal **6-character invite code**, shown on their home screen with copy and share buttons.
- The student enters the code; a Cloud Function validates it and links the student to that teacher. Clients can never list or read invite codes directly.
- One teacher — many students; one student — exactly one teacher.
- A student who isn't linked sees a screen asking for the code.

## Assignments

- A weekly assignment has **several practice items** (e.g. scale + étude + piece).
- Each item may have: sheet music (image/PDF), accompaniment (mp3), YouTube link, metronome BPM. All optional.
- The teacher sets a **daily goal in minutes per assignment**.
- **Assignments never close.** No "main assignment": assignments are listed chronologically, newest first, grouped by week. The student can keep practicing any of them.
- Each item has a status: "עובד/ת על זה" / "מוכן!".
- One recording per item, **max 3 minutes**. If a recording already exists, show a confirmation before replacing it: "כבר יש הקלטה לפריט הזה. להחליף אותה בהקלטה החדשה? ההקלטה הקודמת תימחק." with "להחליף" / "לבטל". On cancel, the new recording is discarded and the old one stays.
- The teacher replies to a recording with short text.
- The teacher can save an assignment as a **template** and copy it to other students or other weeks.
- Accompaniment player: play/stop only. Metronome: uses the item's BPM.

## Data model (Firestore)

| Path | Fields |
|------|--------|
| `users/{uid}` | role (teacher/student, immutable), name, createdAt. Students: birthDate, isMinor, instrument, level, teacherId, consentBy (self/parent), consentAt. Teachers: teacherStatus (pending/approved/rejected — writable only by Functions), inviteCode |
| `inviteCodes/{code}` | teacherId — **no client access**, Functions only |
| `parentConsents/{id}` | studentId, teacherId, parentEmail, tokenHash, sentAt, expiresAt, parentName, approvedAt — teacher can read status of own students only; writes via Functions only |
| `assignments/{id}` | teacherId, studentId, title, description, dailyGoalMinutes, weekStart, createdAt |
| `assignments/{id}/items/{itemId}` | position, title, sheetPath, accompanimentPath, youtubeUrl, metronomeBpm, status (working/ready), statusUpdatedAt, recording { path, durationSeconds, uploadedAt } |
| `assignments/{id}/items/{itemId}/comments/{commentId}` | authorId, text, createdAt, readAt (for the "חדש" badge) |
| `practiceLogs/{id}` | studentId, teacherId, assignmentId, minutes, startedAt, endedAt |
| `templates/{id}` | teacherId, title, description, dailyGoalMinutes, createdAt |
| `templates/{id}/items/{itemId}` | position, title, sheetPath, accompanimentPath, youtubeUrl, metronomeBpm |

`teacherId` and `studentId` are duplicated onto documents on purpose so security rules can check access without extra reads.

## Security rules (Firestore + Storage) — critical, the users are mostly minors

- A student reads and writes only their own data. A teacher reads and writes only data of students whose `teacherId` is that teacher, and only their own templates. Nobody sees anything else.
- Students may update only: their own profile fields (not role, not isMinor, not consent fields, not teacherId), item `status`, item `recording`, `readAt` on comments, and their own practice logs.
- Teachers may create/edit assignments, items, templates and comments for their own students only, and **only when `teacherStatus` is `approved`**.
- Only an admin (custom claim) can see the pending-teachers list; approval itself happens only in a Cloud Function.
- **A minor without `consentAt` cannot write `recording` and cannot upload to the recordings path** — enforce in both Firestore and Storage rules, not only in the UI.
- Storage paths:
  - `sheet-music/{teacherId}/{fileId}` — teacher writes; teacher and their linked students read. Images/PDF/mp3 only, max 20 MB.
  - `recordings/{studentId}/{assignmentId}/{itemId}` — the student writes (if consented); the student and their teacher read. Audio only, max 5 MB.
- No public files, ever.
- **Every rule must have tests** run against the emulator (`@firebase/rules-unit-testing`), including negative tests: another teacher, another student, an unlinked student, a minor without consent, a pending or rejected teacher, a non-admin trying to approve.

## Definition of done for every phase
- Works in the emulator on a phone-sized screen, in RTL.
- Security-rule tests pass.
- The owner has seen it in the browser and approved.
- Committed to git.
