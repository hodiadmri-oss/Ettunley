# Etunley — things to do when the app grows

Written for the owner. Claude will also remind you at the start of phase 7 and
whenever you talk about inviting more teachers. Tick items as you finish them.

## Before the MVP goes live with the 2–5 teachers you know (phase 7)

- [ ] Budget alert has several thresholds and goes to an inbox you really read.
- [ ] Your Google account (the Firebase project owner) has 2-step verification, ideally a passkey or security key.
- [ ] App Check is switched on; backups are switched on (Claude walks you through it).
- [ ] You tested the whole flow yourself with one real teacher and one student (a minor and an adult).
- [ ] You know who answers privacy requests (you) and where they arrive (see next section).

## Before you invite more people than the first few teachers

- [ ] **A lawyer, about one hour**, on: terms of use; the privacy notice; copyright of the sheet music and backing tracks teachers upload (and what the "I have the right to use these materials" statement should say); the parent consent text; recording children's voices; whether a database registration or other duties apply under the Israeli Privacy Protection Law (Amendment 13). Bring `CLAUDE.md` ("Deleting data and privacy") and `SECURITY.md`.
- [ ] **A real privacy contact address** on your own domain, for example `privacy@yourdomain`, forwarded to you (and later to others). Replace `PRIVACY_CONTACT_EMAIL` in the code and check the privacy page and the parent e-mail. Do not use your personal address.
- [ ] **A domain**, bought only after the app's name is final. Then: the e-mail sending domain for parent e-mails (SPF, DKIM, DMARC), the Hosting custom domain, the authorized domain in Firebase Authentication, the API-key restriction, and the CSP line in `firebase.json`.
- [ ] **A routine for requests:** who answers deletion and privacy requests and within how long (suggestion: within 14 days; the law in many places allows up to 30). Where to find the Delete function: `/admin`.
- [ ] **A routine for copyright complaints:** if someone complains about a file, remove it from `/admin` the same day and tell the teacher.
- [ ] **What to do after a data leak** (decide in advance, with the lawyer): who to tell, how fast, and how.
- [ ] **Teacher approval:** decide how you verify a teacher before pressing "approve" (for example a phone call or someone you know).
- [ ] **An outside security check** by a professional, once real children's data is held at a larger scale. Claude's review is thorough but is not an independent audit.
- [ ] Read `SECURITY.md` section 5 (accepted risks) again and decide if they are still acceptable.

## Decided, so no action needed now

- Recordings are deleted 12 months after upload; users are told at sign-up.
- Teachers confirm every new student and can remove a student or renew an invite code.
- Teachers sign in with Google only.
