# Etunley — phase prompts for Claude Code

Paste one phase at a time into Claude Code. Don't move to the next phase until the current one is done and approved. `CLAUDE.md` must be in the project root before phase 0.

---

## Phase 0 — Setup (no app code yet)

Read CLAUDE.md. I'm not a programmer, so guide me in Hebrew, step by step, and wait for me after each step.

Help me set up everything needed before writing app code:
1. Check what's installed on my computer (Node.js LTS, git, Java for the Firebase emulators, Firebase CLI) and walk me through installing anything missing.
2. Create the project folder with git, and a private GitHub repository. Make the first commit with CLAUDE.md and phases.md.
3. Walk me through creating a Firebase project in the console, upgrading it to the Blaze plan, and **creating a budget alert** in Google Cloud billing.
4. Before I choose locations for Firestore and Storage, explain the options in plain Hebrew (cost, speed from Israel, where children's data will be stored) and that the choice is permanent. Let me decide.
5. Enable Email/Password and Google sign-in in Firebase Authentication.

Don't write any app code in this phase. Stop and summarize what's done.

---

## Phase 1 — Foundation

Read CLAUDE.md. Build only the foundation, not the full screens:

1. Vite + React + TypeScript + Tailwind + shadcn/ui, full RTL, Heebo font, Firebase SDK, Firebase emulators configured.
2. Firestore and Storage security rules for the **full** data model in CLAUDE.md, with rule tests (including the negative cases). Show me the test results and explain in Hebrew what they prove.
3. Authentication: sign up, sign in (email+password and Google), sign out, role selection (teacher/student, immutable).
4. Student onboarding: name, date of birth, instrument, level, and the consent step for adults.
5. Teacher approval: pending-teacher screen (with the copyright statement checkbox), the admin claim script (walk me through running it on my own account), the `/admin` page with approve/reject, and the Cloud Function that approves and creates the teacher's invite code.
6. Linking a student to a teacher by invite code (Cloud Function) with **teacher confirmation**: the code creates a pending link; the teacher approves or rejects from the teacher home screen. Also: the teacher can remove a student and can generate a new invite code (Cloud Functions). Wrong-code attempts are rate-limited.
7. Parental consent flow for minors: on the teacher's home screen, a simple list of minor students awaiting approval with an email field and send button; the Cloud Function that sends the email (use the emulator / log the email locally for now — no real email provider yet); the public consent page; status update.
8. Deletion and privacy (see "Deleting data and privacy" in CLAUDE.md): "delete my account" for students and teachers, owner deletion from `/admin`, and the plain-Hebrew privacy notice. All of it tested in the emulator.
9. Navigation skeleton with two empty home screens: `/student` (student name and teacher name) and `/teacher` (teacher name, invite code with copy and share). Route by role after sign-in.

Don't build assignments, timer, recordings or the dashboard yet. Stop, tell me what you built, and give me a checklist of what to try in the browser (including trying to break things: a second teacher, a pending teacher, a student without a code, a minor).

---

## Phase 2 — Assignments and templates

Read CLAUDE.md. The teacher creates an assignment for a student from the phone: title, description, daily goal in minutes, and several items (sheet music image/PDF, accompaniment mp3, YouTube link, metronome BPM — all optional). The teacher can save an assignment as a template and create a new assignment from a template, for any of their students.

Every upload of sheet music or backing tracks shows the copyright statement checkbox from CLAUDE.md; the owner can remove files from `/admin`.

The student sees all their assignments chronologically, newest first, grouped by week, and can open each one and its items.

Stop and give me a browser checklist.

---

## Phase 3 — Practice

Read CLAUDE.md. Inside an assignment, the student gets:
- A timer with one button ("התחלתי לתרגל" / "סיימתי"), saving a practice log. Handle the screen locking or the tab closing mid-session sensibly, and tell me what you chose.
- Accompaniment player: play/stop only.
- Metronome using the item's BPM.
- Status per item: "עובד/ת על זה" / "מוכן!".

Stop and give me a browser checklist — I'll test it on my phone next to an instrument.

---

## Phase 4 — Recording

Read CLAUDE.md. The student records in the browser (max 3 minutes, with a visible countdown) and attaches the recording to an item. If a recording already exists, ask for confirmation before replacing it (exact texts in CLAUDE.md). Minors without parental consent see the locked message instead of the record button.

Check that recording works on iPhone Safari and Android Chrome, and tell me about any limitations in Hebrew.

---

## Phase 5 — Teacher screen

Read CLAUDE.md. Mobile-first teacher home screen:
- List of students with: minutes practiced this week vs. the daily goal, day streak, item statuses, parental-consent status for minors.
- Recordings waiting to be listened to, with a player and a one-line text reply.
- Template management.

---

## Phase 6 — Motivation and coming back

Read CLAUDE.md. On the student's home screen: progress vs. today's goal, day streak, and new teacher replies with a prominent "חדש" badge (cleared when read).

---

## Phase 7 — Going live

Read CLAUDE.md. Walk me through, step by step, with my approval at each step:
1. Setting up the email provider (Resend by default) and a sending domain, and storing the API key as a Functions secret.
2. Enabling App Check.
3. Confirming the budget alert exists.
4. Deploying rules, functions and hosting to production.
5. A short test with one real teacher and one student before inviting the other teachers.
