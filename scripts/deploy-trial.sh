#!/usr/bin/env bash
# Puts a TRIAL version of the app on the real Firebase project.
# Run it in Google Cloud Shell, from the project folder:   bash scripts/deploy-trial.sh
#
# What it does, in order:
#   1. asks you to confirm
#   2. turns on the Google services the app needs
#   3. installs the code's libraries
#   4. makes sure you are signed in to Firebase
#   5. finds (or creates) the web app and reads its public key
#   6. stores a placeholder for the e-mail key (no real e-mails are sent yet)
#   7. builds everything
#   8. publishes rules and the website, then the functions in small groups
# Later updates:   bash scripts/deploy-trial.sh update
#   (publishes rules, website and only the functions listed in UPDATE_FUNCTIONS below)
# Nothing here ever reads or prints a password. The public web key it handles is not secret.
set -euo pipefail

PROJECT="ettunley-61749"
BUCKET="$PROJECT.firebasestorage.app"
# Functions that changed since the last published version (used by "update").
UPDATE_FUNCTIONS="deleteAssignment,adminListFiles,adminRemoveFile"
MODE="${1:-full}"
cd "$(dirname "$0")/.."

say() { printf '\n=== %s ===\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

say "This will publish the trial app to the REAL project: $PROJECT"
cat <<TXT
It will:
  - publish the database and file-storage security rules
  - publish the Cloud Functions (Tel Aviv, me-west1)
  - publish the website at https://$PROJECT.web.app
Costs: normally 0 within the free monthly quota. No real e-mails are sent.
TXT
read -r -p "Type yes to continue: " answer
[ "$answer" = "yes" ] || die "Stopped. Nothing was changed."

say "1/7 Google project"
gcloud config set project "$PROJECT" >/dev/null
say "2/7 Turning on the Google services the app needs (can take a minute)"
gcloud services enable \
  cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  run.googleapis.com eventarc.googleapis.com cloudscheduler.googleapis.com \
  secretmanager.googleapis.com firebaserules.googleapis.com identitytoolkit.googleapis.com \
  firebasehosting.googleapis.com

say "3/7 Installing libraries (a few minutes the first time)"
npm ci --no-audit --no-fund
npm --prefix functions ci --no-audit --no-fund
FB="npx firebase"

say "4/7 Firebase sign-in"
if ! $FB projects:list --non-interactive >/dev/null 2>&1; then
  echo "Sign in to Firebase: open the link it prints, approve, and paste the code back here."
  $FB login --no-localhost
fi

say "5/7 Web app and its public key"
APP_ID="$($FB apps:list WEB --project "$PROJECT" 2>/dev/null | grep -oE '1:[0-9]+:web:[0-9a-f]+' | head -1 || true)"
if [ -z "$APP_ID" ]; then
  echo "Creating the web app 'Ettunley'..."
  $FB apps:create WEB Ettunley --project "$PROJECT"
  APP_ID="$($FB apps:list WEB --project "$PROJECT" 2>/dev/null | grep -oE '1:[0-9]+:web:[0-9a-f]+' | head -1 || true)"
fi
[ -n "$APP_ID" ] || die "Could not find the web app id."
API_KEY="$($FB apps:sdkconfig WEB "$APP_ID" --project "$PROJECT" 2>/dev/null | grep -oE 'AIza[0-9A-Za-z_-]{35}' | head -1 || true)"
[ -n "$API_KEY" ] || die "Could not read the web key."
printf 'VITE_FIREBASE_API_KEY=%s\n' "$API_KEY" > .env.production.local
# The values below are the defaults the deploy would otherwise ask about every time.
# Replace them before a wider launch (see LAUNCH-CHECKLIST.md).
{
  printf 'APP_URL=https://%s.web.app\n' "$PROJECT"
  printf 'EMAIL_FROM=Etunley <onboarding@resend.dev>\n'
  printf 'PRIVACY_CONTACT_EMAIL=privacy@example.invalid\n'
} > "functions/.env.$PROJECT"

say "6/7 E-mail key placeholder"
if ! $FB functions:secrets:access RESEND_API_KEY --project "$PROJECT" >/dev/null 2>&1; then
  printf 'not-set-yet' | $FB functions:secrets:set RESEND_API_KEY --data-file - --project "$PROJECT"
fi

say "7/7 Building and publishing"
npm run build
npm --prefix functions run build
echo "If it asks to give Storage permission to read Firestore, answer Y (the file rules need it)."
# Rules and website first, then the functions in small groups: Google limits how many
# functions can be created per minute, and a big single deploy often fails half-way.
$FB deploy --project "$PROJECT" --only firestore,storage,hosting

if [ "$MODE" = "update" ]; then
  FUNCTION_GROUPS=("$UPDATE_FUNCTIONS")
else
  FUNCTION_GROUPS=(
    "approveTeacher,listTeachers,rejectTeacher,joinTeacher"
    "respondToStudent,removeStudent,regenerateInviteCode,cancelJoinRequest"
    "sendParentConsent,getParentConsentInfo,approveParentConsent,getParentManageInfo"
    "manageParentConsent,deleteMyAccount,adminLookupUser,adminDeleteUser"
    "deleteAssignment,adminListFiles,adminRemoveFile,adminReadFile"
    "adminListStudents,dailyRetention"
  )
fi
for group in "${FUNCTION_GROUPS[@]}"; do
  only="$(printf 'functions:%s,' ${group//,/ })"
  only="${only%,}"
  say "Functions: $group"
  for attempt in 1 2 3; do
    if $FB deploy --project "$PROJECT" --only "$only"; then break; fi
    [ "$attempt" = 3 ] && echo "WARNING: this group did not finish. Run the script again; finished groups are quick."
    sleep 30
  done
done

say "Letting the website call the functions (safe to repeat)"
# The website must be allowed to *call* each function; each function still checks by itself
# who is calling. Google sometimes skips this step when many functions are created at once.
for f in approveteacher listteachers rejectteacher jointeacher respondtostudent removestudent \
  regenerateinvitecode canceljoinrequest sendparentconsent getparentconsentinfo approveparentconsent \
  getparentmanageinfo manageparentconsent deletemyaccount adminlookupuser admindeleteuser \
  deleteassignment adminlistfiles adminremovefile adminreadfile adminliststudents; do
  gcloud run services add-iam-policy-binding "$f" --region=me-west1 --member=allUsers \
    --role=roles/run.invoker --project="$PROJECT" --quiet >/dev/null 2>&1 && echo "ok $f" || echo "skipped $f"
done

say "Letting the website open the private sheet-music files (CORS)"
# Files stay private (the storage rules decide who may read). This only lets pages from
# our own addresses ask for them.
CORS_FILE="$(mktemp)"
cat > "$CORS_FILE" <<JSON
[{"origin": ["https://$PROJECT.web.app", "https://$PROJECT.firebaseapp.com"], "method": ["GET"], "responseHeader": ["Content-Type", "Authorization"], "maxAgeSeconds": 3600}]
JSON
gsutil cors set "$CORS_FILE" "gs://$BUCKET" || echo "WARNING: could not set CORS; sheet music will not open until it is set (see docs/DEPLOY-TRIAL.md)."
rm -f "$CORS_FILE"

say "Done"
echo "Open:  https://$PROJECT.web.app"
echo "Next:  sign in once with Google there, then make yourself admin (docs/ADMIN-SETUP.md)."
