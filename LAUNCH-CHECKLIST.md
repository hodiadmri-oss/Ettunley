# Etunley — things to do when the app grows

Written for the owner. Claude will also remind you at the start of phase 7 and
whenever you talk about inviting more teachers. Tick items as you finish them.

## Before the MVP goes live with the 2–5 teachers you know (phase 7)

- [ ] Budget alert has several thresholds and goes to an inbox you really read.
- [ ] Your Google account (the Firebase project owner) has 2-step verification, ideally a passkey or security key.
- [ ] App Check is switched on; backups are switched on (Claude walks you through it).
- [ ] The password-reset e-mail (Firebase console > Authentication > Templates): Hebrew text, a friendly sender name, and check that it does not land in spam. Later it can be sent from your own domain.
- [ ] **Parent e-mails go out for real** (Claude walks you through it, step by step): an account with the e-mail service (Resend), a sending address, and the API key stored as a Functions secret. Until then nothing is sent: in the emulator the e-mail is only stored. Also set the two production settings `APP_URL` (the app's web address, used in the link) and `EMAIL_FROM`.
- [ ] **The privacy contact address** appears in two places in the code: `PRIVACY_CONTACT_EMAIL` in `src/lib/strings.ts` and the `PRIVACY_CONTACT_EMAIL` setting of the Functions. Until a real address is set, the contact sentence is left out of the parent e-mail and page.
- [ ] You made yourself the admin, following `docs/ADMIN-SETUP.md` (the first time on the real project; Claude walks you through it).
- [ ] You tested the whole flow yourself with one real teacher and one student (a minor and an adult).
- [ ] You know who answers privacy requests (you) and where they arrive (see next section).

## Before you invite more people than the first few teachers

- [ ] **A lawyer, about one hour**, on: terms of use; the privacy notice; copyright of the sheet music and backing tracks teachers upload (and what the "I have the right to use these materials" statement should say); the exact wording of the consent texts (the adult checkbox and the parent page say recordings are shared "with my teacher", without the word "only"; check what is accurate and enough); recording children's voices; whether a database registration or other duties apply under the Israeli Privacy Protection Law (Amendment 13). Bring `CLAUDE.md` ("Deleting data and privacy") and `SECURITY.md`.
- [ ] **A real privacy contact address** on your own domain, for example `privacy@yourdomain`, forwarded to you (and later to others). Replace `PRIVACY_CONTACT_EMAIL` in the code and check the privacy page and the parent e-mail. Do not use your personal address.
- [ ] **A domain**, bought only after the app's name is final. Then: the e-mail sending domain for parent e-mails (SPF, DKIM, DMARC), the Hosting custom domain, the authorized domain in Firebase Authentication, the API-key restriction, and the CSP line in `firebase.json`.
- [ ] **A routine for requests:** who answers deletion and privacy requests and within how long (suggestion: within 14 days; the law in many places allows up to 30). Where to find the Delete function: `/admin`.
- [ ] **Fixing a wrong birth date:** a student cannot change it (on purpose, so a child cannot turn into an adult). If someone typed it wrong, only you can fix it (today: in the Firebase console on the student's profile, fields `birthDate` and `isMinor`; later: a button in `/admin`). Decide how a request like that is verified.
- [ ] **A routine for copyright complaints:** if someone complains about a file, remove it from `/admin` the same day and tell the teacher.
- [ ] **What to do after a data leak** (decide in advance, with the lawyer): who to tell, how fast, and how.
- [ ] **Teacher approval:** decide how you verify a teacher before pressing "approve" (for example a phone call or someone you know).
- [ ] **An outside security check** by a professional, once real children's data is held at a larger scale. Claude's review is thorough but is not an independent audit.
- [ ] Read `SECURITY.md` section 5 (accepted risks) again and decide if they are still acceptable.

## Decided, so no action needed now

- Recordings are deleted 12 months after upload; users are told at sign-up.
- Teachers confirm every new student and can remove a student or renew an invite code.
- Teachers sign in with Google only.
