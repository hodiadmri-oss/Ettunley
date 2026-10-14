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
| F11 | `npm audit` reports `@grpc/grpc-js` | Checked: used only by the Node build, not in the browser bundle. Do not run `npm audit fix --force` (it would downgrade Firebase to v9). Re-audit when Cloud Functions are added. |

## 3. Requirements for the phases still to build

### Phase 1 (remaining steps)
- **Invite-code linking function**
  - Codes: 6 characters, `crypto` random, unambiguous alphabet (no 0/O/1/I).
  - Rate-limit wrong guesses per user (e.g. 5 per hour, then lock out) and per IP. Brute force over about 10^9 codes would otherwise let a stranger attach to a teacher.
  - Same answer for "no such code" and "code locked". Enforce App Check. Do not log codes.
  - Sets `teacherId` **and** `teacherName` on the student (Functions only; rules already forbid the client).
- **Teacher approval function**
  - Verify the `admin` claim and `email_verified` of the caller; verify the target is a `pending` teacher; do it in one transaction; generate the code with collision retry.
  - The admin list needs the teacher's e-mail, which is not stored in Firestore: return it from a callable function using the Admin SDK instead of copying it into the database.
  - Do not approve a teacher whose e-mail is not verified.
- **Parental consent**
  - Token: 32 random bytes, only its SHA-256 stored, 7-day expiry, single use (transaction), delete the hash after use.
  - The link must never change state on `GET` (mail scanners open links). Approval is a `POST` after the parent ticks the box.
  - Put the token in the URL fragment, serve that page with `Referrer-Policy: no-referrer` (already in `firebase.json`), identical errors for wrong/expired/used tokens, per-IP and per-token attempt limits.
  - The teacher can trigger an e-mail to an arbitrary address, so it can be abused as a spam relay: only for the teacher's own minor students without consent, at most 3 sends per student per day, fixed template, names length-limited and HTML-escaped, no free text from the teacher. Never log e-mail addresses or tokens.
- **Auth settings** (console): keep "email enumeration protection" on, only the production domain (and `localhost` during development) as authorized domains, password minimum length 10, verification e-mail for e-mail/password accounts. The owner signs in with Google (verified e-mail) before the admin claim is set, by UID.
- **Admin claim script**: runs only on the owner's computer, key file outside the repo, deleted after use.

### Phase 2 (assignments)
- Render every user-supplied string (names, titles, comments) as plain text. No `dangerouslySetInnerHTML`, no auto-linking.
- YouTube: parse the video id and build the link ourselves; prefer a plain "open in YouTube" link (`rel="noopener noreferrer"`) over an embedded player (no third-party iframe for children).
- Never navigate to a Storage URL; show images through `<img>`, audio through `<audio>`.
- **Download tokens:** `getDownloadURL()` creates a permanent link that works for anyone who has it, bypassing our rules. For children's recordings and sheet music do not use it. Use `getBlob()` (needs a CORS setting on the bucket, done in phase 7) or a Cloud Function that issues a short-lived signed URL, plus a Function that strips `firebaseStorageDownloadTokens` from every uploaded object.

### Phases 3–4 (practice, recording)
- Microphone rules from section 1. Replace/discard flow exactly as in `CLAUDE.md`.
- Check the file really is audio on the server (Storage "finalize" function: magic bytes, size) because the declared type is client-chosen.

### Phase 5–6
- Teacher queries always filter by `teacherId`; student queries by `studentId` (the rules depend on it). No listeners on whole collections.

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

## 4. Decisions needed from the owner

| # | Question | Recommendation |
|---|---|---|
| D1 | A student who types a valid code is linked immediately. A stranger who gets a code (it is shared on WhatsApp) becomes "a student" and can upload audio to the teacher. Should the teacher confirm each new student? | **Yes**: new students appear as "pending" and the teacher taps approve. |
| D2 | Can a teacher remove a student, and regenerate their code if it leaks? (Not in the spec.) | Yes, both. |
| D3 | The date of birth is self-declared. A child can enter an adult date and skip parental consent. | The teacher sees the age and a "self-declared" note, and can mark a student as a minor (which requires parent consent). |
| D4 | Deleting data: parents and adults have the right to ask for deletion. Today nothing can be deleted by design. | Add an owner-run (later: in-app) account deletion that also removes recordings; write a short privacy policy and terms; have a lawyer check them against the Israeli Privacy Protection Law (Amendment 13) and, if users abroad join, GDPR/COPPA. |
| D5 | Two-step login for teachers. Firebase's own 2-step login needs Identity Platform and SMS costs. | Teachers sign in with Google (usually already 2-step); e-mail/password stays allowed for students. |
| D6 | Abuse of the recording feature (offensive audio sent to a teacher). | D1 + D2 are enough for an MVP with known teachers. |
| D7 | The budget alert only e-mails. | Keep as is for the MVP; consider an automatic shut-off later. |

## 5. Accepted residual risks

- A student can fake practice minutes (the timer is on their device). The teacher sees the recordings, which are the real signal.
- The file type of an upload is declared by the client until the Storage finalize check exists (phase 4).
- A logged-in student could still write many valid documents. App Check, the budget alert and the 5 MB / 3 minute limits bound the damage.
- If a teacher's Google or e-mail account is taken over, the attacker sees that teacher's students. This is why D5 matters.
