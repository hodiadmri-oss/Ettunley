# הגדרת חשבון המנהלת (פעם אחת)

**אם העלית את האפליקציה עם `docs/DEPLOY-TRIAL.md`:** הקבצים כבר ב-Cloud Shell. מספיק להריץ `node scripts/set-admin.mjs המייל-שלך@gmail.com` מתוך תיקיית הפרויקט.

**מתי עושים את זה:** רק כשהאפליקציה עולה לאוויר בפעם הראשונה (שלב 7). עד אז לא צריך לעשות כלום; הבדיקות רצות על חשבון מדומה.

**מה זה עושה:** מסמן את חשבון ה-Google שלך כ"מנהלת", כדי שתוכלי לפתוח את דף הניהול ולאשר מורים.

**למה בלי קובץ מפתח:** משתמשים ב-Google Cloud Shell, מסוף בתוך הדפדפן שכבר מחובר לחשבון Google שלך. אין קובץ מפתח שצריך להוריד או לשמור, ולכן אין מה שיכול להישכח או לדלוף.

## לפני שמתחילים

1. כניסה לאפליקציה (באתר שלה) עם חשבון ה-Google שלך, פעם אחת. יופיע מסך "מי את/ה?". **לא בוחרים כלום**, לוחצים "יציאה". זה רק יוצר את החשבון.
2. מוודאים שאת מחוברת בדפדפן לאותו חשבון Google שבו נוצר פרויקט ה-Firebase.

## השלבים

1. נכנסים ל-**https://shell.cloud.google.com** ומאשרים את תנאי השימוש אם מבקשים. נפתח מסוף שחור בתחתית המסך.
2. מקלידים (או מדביקים) ולוחצים Enter:

   ```
   gcloud config set project ettunley-61749
   ```

   אם מופיעה בקשת הרשאה, לוחצים "Authorize".
3. יוצרים את הסקריפט. מדביקים את **כל** הבלוק הבא כמו שהוא (מ-`cat` ועד `EOF`) ולוחצים Enter:

   ```
cat > set-admin.mjs <<'EOF'
// Gives one Google account the "admin" claim, so it can open /admin.
// Run it only on the owner's side (Google Cloud Shell or her computer), never from the app.
//
//   node set-admin.mjs owner@gmail.com            (real project; uses your own Google login)
//   node set-admin.mjs owner@gmail.com --remove   (takes the claim away again)
//
// It needs the e-mail to already exist in the project (sign in once with Google first)
// and to be verified. No key file is needed: Cloud Shell already knows who you are.
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const [email, flag] = process.argv.slice(2)
if (!email || !email.includes('@')) {
  console.error('Usage: node set-admin.mjs <google-email> [--remove]')
  process.exit(1)
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'ettunley-61749' })
const auth = getAuth()

try {
  const user = await auth.getUserByEmail(email)
  if (flag === '--remove') {
    await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: null })
    await auth.revokeRefreshTokens(user.uid)
    console.log(`Admin removed from ${email}.`)
  } else {
    if (!user.emailVerified) throw new Error('This e-mail is not verified. Sign in with Google first.')
    if (!user.providerData.some((p) => p.providerId === 'google.com')) {
      throw new Error('This account does not use Google sign-in.')
    }
    await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true })
    await auth.revokeRefreshTokens(user.uid)
    console.log(`Done: ${email} is now the admin. Sign out and sign in again in the app.`)
  }
} catch (e) {
  console.error('Failed:', e.message)
  process.exit(1)
}
EOF
   ```
4. מתקינים את הספרייה שהסקריפט צריך:

   ```
   npm install firebase-admin
   ```
5. מריצים, **כשבמקום the-email מקלידים את כתובת ה-Gmail שלך**:

   ```
   node set-admin.mjs the-email@gmail.com
   ```

   ההצלחה נראית כך: `Done: ... is now the admin.`
6. באפליקציה: יוצאים ונכנסים שוב עם Google. תגיעי ישר לדף "ניהול".

## אם משהו לא עובד

- `This e-mail is not verified` או `User not found`: לא נכנסת לאפליקציה עם Google קודם (שלב 1 למעלה).
- שגיאת הרשאות (`permission`): מוודאים שזה אותו חשבון Google של הפרויקט. אם נשארת תקועה, אומרים לי, ואני נותן דרך נוספת.

## להסיר הרשאת מנהלת

```
node set-admin.mjs the-email@gmail.com --remove
```

## חשוב

- אין קובץ מפתח. אם בכל זאת מישהו מבקש ממך "קובץ מפתח", לא לשלוח.
- כל מי שיכול לפתוח את Cloud Shell בחשבון שלך יכול להריץ את הפקודה. לכן חשוב אימות דו-שלבי לחשבון ה-Google שלך (ברשימת ההשקה).
- **לא נבדק על הפרויקט האמיתי עדיין.** הסקריפט נבדק על אמולטור בלבד; הבדיקה האמיתית תהיה בהעלאה הראשונה.
