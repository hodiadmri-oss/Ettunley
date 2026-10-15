import { Link } from 'react-router-dom'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { APP_NAME, HAS_PRIVACY_CONTACT, PRIVACY_CONTACT_EMAIL } from '@/lib/strings'

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'מה האפליקציה עושה',
    body: [
      `${APP_NAME} עוזרת לתלמידי מוזיקה לתרגל בבית, ולמורים לדעת מה קרה בין השיעורים.`,
    ],
  },
  {
    title: 'איזה מידע נשמר',
    body: [
      'שם, אימייל (לכניסה), תאריך לידה, כלי נגינה ורמה.',
      'המורה שהתלמיד/ה מחובר/ת אליה, והמטלות שהמורה נותנת.',
      'תיעוד התרגול: כמה דקות תרגלו ומתי, ומה הסטטוס של כל פריט.',
      'הקלטות התרגול, ותגובות קצרות של המורה.',
      'לקטינים: השם של ההורה ומתי אישר/ה. כתובת האימייל של ההורה לא נשמרת אחרי האישור.',
    ],
  },
  {
    title: 'מי רואה את המידע',
    body: [
      'ההקלטות, התרגול והתגובות נראים רק לתלמיד/ה ולמורה שלהם/ן.',
      'מפעילת האפליקציה יכולה, מבחינה טכנית, להגיע למידע, אבל רק כדי לתת תמיכה, לטפל בבקשת מחיקה או לשמור על אבטחה.',
      'האפליקציה פועלת על שירותי Google (Firebase), והנתונים שמורים בישראל. לשליחת מייל להורים משתמשים בשירות שליחת מיילים, שמקבל רק את כתובת ההורה כדי לשלוח את ההודעה.',
      'אין פרסומות, אין מעקב ואין כלי ניתוח של התנהגות משתמשים.',
    ],
  },
  {
    title: 'ילדים ונוער',
    body: [
      'מתחת לגיל 18 צריך אישור של הורה/אפוטרופוס במייל, פעם אחת. עד האישור אפשר לראות מטלות ולתרגל, אבל אי אפשר להקליט.',
      'ההורה יכול בכל זמן לבטל את האישור (ההקלטות יימחקו) או למחוק את כל המידע של הילד/ה, מהקישור האישי שמופיע במייל שקיבל/ה.',
    ],
  },
  {
    title: 'כמה זמן המידע נשמר',
    body: [
      'כל הקלטה נמחקת אוטומטית 12 חודשים אחרי שהועלתה.',
      'שאר המידע נשמר עד שהחשבון נמחק.',
    ],
  },
  {
    title: 'מחיקה',
    body: [
      'אפשר למחוק את החשבון בכל זמן: בהגדרות, "מחיקת החשבון שלי". זה מוחק לצמיתות את הפרופיל, ההקלטות, המטלות ותיעוד התרגול.',
      'אם מישהו אחר (למשל הורה) רוצה למחוק מידע, אפשר לפנות אלינו והמפעילה תמחק.',
    ],
  },
  {
    title: 'אבטחה',
    body: [
      'הגישה למידע מוגבלת בכללים: כל אחד רואה רק את שלו. החיבור מוצפן. קבצי הקלטה אינם פומביים.',
    ],
  },
]

export default function Privacy() {
  return (
    <Screen title="מדיניות פרטיות">
      <div className="flex flex-col gap-5 text-lg">
        {SECTIONS.map((section) => (
          <section key={section.title} aria-labelledby={section.title} className="flex flex-col gap-2">
            <h2 id={section.title} className="text-xl font-bold">
              {section.title}
            </h2>
            {section.body.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        ))}
        {HAS_PRIVACY_CONTACT && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">יצירת קשר</h2>
            <p dir="ltr" className="text-start">
              {PRIVACY_CONTACT_EMAIL}
            </p>
          </section>
        )}
        <p className="rounded-2xl bg-sky px-4 py-3 text-base">
          זו טיוטה בניסוח פשוט, ועדיין לא נבדקה על ידי עורך דין.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">חזרה</Link>
      </Button>
    </Screen>
  )
}
