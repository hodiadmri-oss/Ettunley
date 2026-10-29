# Etunley — security review and requirements

Last review: after phase 1, step 2 (rules + tests). Users are mostly children, so
every item below is a requirement unless it is explicitly marked as a decision.
Anyone building a later phase must read this file first.

## 1. What the app can touch on a user's device

The app is a website. It can only do what the browser allows, and we keep that
as small as possible:

| Capability | Use | Rule |
|---|---|---|
| Microphone | Recording (phase 4) | Ask only after the student taps "record". Stop all tracks the moment recording ends or is cancelled (so the browser mic indicator turns off). Never record in the background, never auto-start, never upload without an explicit tap. |
| Clipboard | Copy the teacher's invite code | Write only, on a tap. Never read the clipboard. |
| Share sheet | Share the invite code | On a tap only. |
| Camera, location, contacts, notifications, Bluetooth, USB | Not used | Blocked by `Permissions-Policy` in `firebase.json`. |
| Third-party scripts, analytics, ads, trackers | Not used | Blocked by CSP (`script-src 'self'` plus Google sign-in only). Do not add Firebase Analytics or any SDK that profiles children. |
| Local storage on the device | Firebase sign-in token only | No personal data in `localStorage`. Do **not** enable Firestore offline persistence (shared family devices). Sign-out must clear caches. |

## 2. Fixed so far

| # | Finding | Fix |
|---|---|---|
| F1 | Anonymous sign-in would have passed `request.auth != null` | Rules refuse `sign_in_provider == 'anonymous'` (tested) |
| F2 | "Pre-hijacking": someone registers the owner's e-mail with a password before the owner does, and later shares the account | Admin requires `admin` claim **and** `email_verified` (tested) |
| F3 | Ids interpolated into rule paths could contain `/` | `isPlainId()` check on `studentId`, `assignmentId` (tested) |
| F4 | `youtubeUrl` accepted any string (`javascript:` etc.) | Rules accept only real YouTube links (tested with 6 attack strings) |
| F5 | `image/*` allowed SVG (can carry scripts) | Closed allow-lists for sheet music and recording types (tested) |
| F6 | A student could list a teacher's folder and discover all file names | Storage rules allow `get` only, never `list` (tested) |
| F7 | A student could log "600 minutes" in one second, or backfill months | Practice-log times must be consistent, not in the future, not older than 7 days (tested) |
| F8 | Google Fonts leaks every child's IP address to Google | Heebo is self-hosted (`@fontsource/heebo`); verified: zero requests to other hosts |
| F9 | No browser hardening | Hosting headers: strict CSP, HSTS, `nosniff`, no framing, `Referrer-Policy`, `Permissions-Policy`. Verified in Chromium that the page loads under the CSP and that an injected inline script is blocked. **Re-test with Google sign-in in a real browser in phase 7.** |
| F10 | Secrets in git | History scanned: no keys. `.env*`, service accounts and emulator logs are git-ignored. |
| F12 | Strangers with a leaked invite code | Teacher confirmation and removal enforced in rules (tests: pending, removed students) |
| F13 | Weak teacher accounts | Teachers: Google sign-in with verified e-mail only (rules, tested) |
| F11 | `npm audit` reports `@grpc/grpc-js` | Checked: used only by the Node build, not in the browser bundle. Do not run `npm audit fix --force` (it would downgrade Firebase to v9). Re-audit when Cloud Functions are added. |

## 3. Requirements for the phases still to build

### Phase 1 (remaining steps)
- **Invite-code linking function**
  - Codes: 6 characters, `crypto` random, unambiguous alphabet (no 0/O/1/I).
  - Rate-limit wrong guesses per user (e.g. 5 per hour, then lock out) and per IP. Brute force over about 10^9 codes would otherwise let a stranger attach to a teacher.
  - Same answer for "no such code" and "code locked". Enforce App Check. Do not log codes.
  - Sets `teacherId`, `teacherName` and `linkStatus: pending` on the student (Functions only; rules already forbid the client). Approve / reject / remove / regenerate-code are also Functions that check the caller is that teacher.
- **Done in step 6:** wrong-code lock (5 wrong tries per student per hour, 30 per IP address per hour; the address is stored only as a hash, in `rateLimits/*` which no client can touch), identical answer for wrong / malformed / locked, a code works only while its teacher is approved and it is the teacher's current code, joining only creates a *pending* link, and the teacher's decisions run in Functions that check the student is theirs.
- **Teacher approval function**
  - Verify the `admin` claim and `email_verified` of the caller; verify the target is a `pending` teacher; do it in one transaction; generate the code with collision retry.
  - The admin list needs the teacher's e-mail, which is not stored in Firestore: return it from a callable function using the Admin SDK instead of copying it into the database.
  - Do not approve a teacher whose e-mail is not verified.
- **Done in step 7:** 256-bit random token, only its SHA-256 stored and deleted after use; 7-day expiry; viewing the link never changes anything (approval is a separate deliberate action with a name and a ticked box); the page asks `getParentConsentInfo` first, wrong / expired / used / made-up links all give the same answer; the token lives after `#` and the page is served without a referrer; sends limited to 3 per student and 20 per teacher per day, only for a confirmed minor without consent; names are HTML-escaped and no teacher text goes into the e-mail; the consent text version is stored. Still to do in step 8: the parent's "withdraw / delete" link.
- **Parental consent**
  - Token: 32 random bytes, only its SHA-256 stored, 7-day expiry, single use (transaction), delete the hash after use.
  - The link must never change state on `GET` (mail scanners open links). Approval is a `POST` after the parent ticks the box.
  - Put the token in the URL fragment, serve that page with `Referrer-Policy: no-referrer` (already in `firebase.json`), identical errors for wrong/expired/used tokens, per-IP and per-token attempt limits.
  - The teacher can trigger an e-mail to an arbitrary address, so it can be abused as a spam relay: only for the teacher's own minor students without consent, at most 3 sends per student per day, fixed template, names length-limited and HTML-escaped, no free text from the teacher. Never log e-mail addresses or tokens.
- **Auth settings** (console): keep "email enumeration protection" on, only the production domain (and `localhost` during development) as authorized domains, password minimum length 8 (checked in the app; also set the Authentication password policy in the console in phase 7). E-mail verification is not required for students: a student account only ever sees its own data, and teachers must use Google (verified e-mail). The owner signs in with Google (verified e-mail) before the admin claim is set, by UID.
- **Admin claim script**: runs only on the owner's computer, key file outside the repo, deleted after use.

### Phase 2 (assignments)
- Render every user-supplied string (names, titles, comments) as plain text. No `dangerouslySetInnerHTML`, no auto-linking.
- YouTube: parse the video id and build the link ourselves; prefer a plain "open in YouTube" link (`rel="noopener noreferrer"`) over an embedded player (no third-party iframe for children).
- Never navigate to a Storage URL; show images through `<img>`, audio through `<audio>`.
- **Download tokens:** `getDownloadURL()` creates a permanent link that works for anyone who has it, bypassing our rules. For children's recordings and sheet music do not use it. Use `getBlob()` (needs a CORS setting on the bucket, done in phase 7) or a Cloud Function that issues a short-lived signed URL, plus a Function that strips `firebaseStorageDownloadTokens` from every uploaded object.

### Deletion (phase 1, step 8)
- Functions: delete own account (re-login required, typed confirmation), owner deletes any user, parent withdraws consent from the e-mail link. Delete Storage objects and Firestore documents together; delete the Auth user last. Idempotent and resumable (a half-finished deletion can be re-run). Tests in the emulator that nothing of the user is left.
- The parent's link ("manage / withdraw") is a separate long-lived token, stored hashed, usable only to withdraw consent or delete that child's data.

- **Done in step 8:** deletion runs only in Functions (the rules still refuse client deletes) and is safe to repeat after a failure (it looks everything up by the person's id and removes the sign-in account last); deleting an account needs a sign-in from the last 5 minutes plus a typed word; the owner's "delete by request" cannot delete an admin or herself; the parent's manage link is a separate 256-bit token (hash only) and the approval link cannot be used as one; a parent's address is removed after approval; recordings are deleted 12 months after upload by a daily job (plus a sweep of orphan files); a minor's parent consent ends with the link to the teacher it named. Tests prove both that everything of the person goes and that nothing of anyone else is touched.

- **Done in phase 2:** assignments are deleted only by a Cloud Function that checks the caller is that assignment's approved teacher and the student is still theirs (it removes items, replies, the assignment's sheet music and the student's recordings for it; practice minutes stay). The owner can list a teacher's files (name, size, date, where used) and remove one from `/admin` (admin-only Functions; paths limited to `sheet-music/`). Sheet music is only ever shown through the signed-in user's own download (never a public link); each assignment and template owns its own copy of a file.

- **Decision (owner, October 2026):** a student sees only assignments of their *current* teacher. Those of a previous teacher stay stored (the student's own data, readable by the student by the rules) but are not shown in the app. Later phases (practice, streak, "new reply" badge) must apply the same filter.

### Phases 3–4 (practice, recording)
- Microphone rules from section 1. Replace/discard flow exactly as in `CLAUDE.md`.
- Check the file really is audio on the server (Storage "finalize" function: magic bytes, size) because the declared type is client-chosen.

### Phase 5–6
- Teacher queries on assignments and practice logs filter by `teacherId` **and one `studentId`** (one query per student; the rules depend on it). Student queries filter by `studentId`. No listeners on whole collections.

### Phase 7 (going live)
- Enforce **App Check** on Firestore, Storage, Functions and Auth (reCAPTCHA). This is the main defence against scripted abuse and cost attacks, because rules cannot rate-limit.
- Restrict the Firebase web API key to our domain and to the needed APIs.
- Budget alert checked; consider an automatic shut-off function (decision D7).
- Turn on Firestore point-in-time recovery / scheduled backups and Storage soft delete.
- Grant Storage the permission to read Firestore (needed for the Storage rules) — ask the owner first.
- Functions run with a dedicated least-privilege service account; secrets only in Functions secrets; region `me-west1`.
- Owner's Google account (project Owner): 2-step verification with a security key or passkey.
- Deploy rules only from a commit where `npm run test:rules` passes.
- Real-browser test of the final CSP, including Google sign-in, Firestore, Storage and recording on iPhone Safari and Android Chrome.

## 4. Owner decisions

Decided:

| # | Decision | Where it is enforced |
|---|---|---|
| D1 | The teacher confirms every new student. | Rules: nothing can be assigned, read or heard for a student whose `linkStatus` is not `approved` (tested). Functions: approve / reject. |
| D2 | Teachers can remove a student and generate a new invite code. | Rules: removal cuts access at once, including old assignments, logs and recordings (tested). Functions: remove / regenerate. |
| D3 | The date of birth stays self-declared; the teacher's confirmation is the check. | The pending-student screen shows name and age (marked self-declared) so the teacher can verify. |
| D4 | Deletion on request, safest legal choice, no lawyer for now. | `CLAUDE.md` "Deleting data and privacy"; Functions in phase 1 step 8. |
| D5 | Teachers sign in with Google only. | Rules: a teacher profile can be created only with `google.com` sign-in and a verified e-mail (tested). |
| D6 | Abuse of recordings. | Covered by D1 + D2. |
| D7 | Budget alert only e-mails. | Re-check in phase 7. |

Open questions (asked in chat, answers go here):

- Q1 Contact e-mail: **postponed by the owner** until wider launch; see `LAUNCH-CHECKLIST.md`. A placeholder setting is used until then.
- Q2 Retention: **decided** — recordings are deleted 12 months after upload; users are told at sign-up.
- Q3 Copyright: **decided** (statement once, at approval; owner can remove files; the owner chose in October 2026 not to repeat it at every upload — the lawyer review should confirm this is enough); a lawyer check is on `LAUNCH-CHECKLIST.md`. Original suggestion: a required statement when a teacher is approved and at upload: "I have the right to use these materials", plus terms that make the teacher responsible and let the owner remove files.

Legal notes written with the safest reading (not legal advice):
- Under 18 always needs a parent's e-mail approval before any recording is stored. The consent record keeps the parent's name, the time and the version of the consent text.
- Data is stored in Israel (`me-west1`). Auth identities are handled by Google.
- Collect only what the product needs. No analytics, ads or trackers.

## 5. Accepted residual risks

- A student can fake practice minutes (the timer is on their device). The teacher sees the recordings, which are the real signal.
- The file type of an upload is declared by the client until the Storage finalize check exists (phase 4).
- A logged-in student could still write many valid documents. App Check, the budget alert and the 5 MB / 3 minute limits bound the damage.
- If a teacher's Google or e-mail account is taken over, the attacker sees that teacher's students. This is why D5 matters.
