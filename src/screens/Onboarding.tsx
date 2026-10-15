import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { giveAdultConsent, saveBirthDate, saveStudentFields, type Profile } from '@/auth/profile'
import { ErrorNote } from '@/components/ErrorNote'
import { Screen } from '@/components/Screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calendarAge, parseBirthDate } from '@/lib/age'
import { INSTRUMENTS, LEVELS, OTHER_INSTRUMENT } from '@/lib/instruments'
import { MAX_NAME_LENGTH } from '@/lib/strings'
import { cn } from '@/lib/utils'

const SAVE_ERROR = 'לא הצלחנו לשמור. אפשר לנסות שוב.'

function formatDate(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${d}.${m}.${date.getUTCFullYear()}`
}

function initialInstrumentChoice(profile: Profile): string {
  if (!profile.instrument) return ''
  return (INSTRUMENTS as readonly string[]).includes(profile.instrument) ? profile.instrument : OTHER_INSTRUMENT
}

// One calm screen. Every field is saved the moment it changes.
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { state, reloadProfile } = useAuth()
  const ready = state.status === 'ready' ? state : null
  const [name, setName] = useState(ready?.profile.name ?? '')
  const [instrumentChoice, setInstrumentChoice] = useState(ready ? initialInstrumentChoice(ready.profile) : '')
  const [otherInstrument, setOtherInstrument] = useState(
    ready && initialInstrumentChoice(ready.profile) === OTHER_INSTRUMENT ? (ready.profile.instrument ?? '') : '',
  )
  const [dateValue, setDateValue] = useState('')
  const [consent, setConsent] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!ready) return null
  const { user, profile } = ready
  const birth = profile.birthDate ? profile.birthDate.toDate() : null
  const chosenBirth = parseBirthDate(dateValue)
  const isMinor = profile.isMinor === true

  async function persist(action: () => Promise<void>): Promise<boolean> {
    setError(null)
    setBusy(true)
    try {
      await action()
      await reloadProfile()
      setSaved(true)
      return true
    } catch {
      setError(SAVE_ERROR)
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveName = () => {
    const clean = name.trim()
    if (clean && clean !== profile.name) void persist(() => saveStudentFields(user.uid, { name: clean }))
  }

  const chooseInstrument = (value: string) => {
    setInstrumentChoice(value)
    if (value && value !== OTHER_INSTRUMENT) void persist(() => saveStudentFields(user.uid, { instrument: value }))
  }

  const saveOtherInstrument = () => {
    const clean = otherInstrument.trim()
    if (clean && clean !== profile.instrument) void persist(() => saveStudentFields(user.uid, { instrument: clean }))
  }

  const complete =
    Boolean(profile.name && profile.birthDate && profile.instrument && profile.level) && (isMinor || consent)

  async function finish() {
    if (!isMinor && !profile.consentAt) {
      if (!(await persist(() => giveAdultConsent(user.uid)))) return
    }
    onDone()
  }

  return (
    <Screen title="כמה פרטים עליך" subtitle="כדי להתחיל">
      <div className="flex flex-col gap-6">
        <p aria-live="polite" className="h-5 text-center text-sm text-ink/60">
          {saved ? '✓ נשמר' : ''}
        </p>

        <div className="flex flex-col gap-2">
          <Label htmlFor="name">שם</Label>
          <Input
            id="name"
            autoComplete="name"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="birth">תאריך לידה</Label>
          {birth ? (
            <p className="rounded-2xl bg-white px-4 py-3 text-lg">
              {formatDate(birth)} <span className="text-ink/60">(אי אפשר לשנות)</span>
            </p>
          ) : (
            <>
              <Input id="birth" type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)} />
              <p className="text-sm text-ink/60">בדקו שהתאריך נכון. אחרי האישור אי אפשר לשנות אותו.</p>
              {chosenBirth && (
                <div className="flex flex-col gap-3 rounded-2xl bg-sky px-4 py-4">
                  <p className="text-lg">הגיל: {calendarAge(chosenBirth)}</p>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void persist(() => saveBirthDate(user.uid, chosenBirth))}
                  >
                    אישור תאריך הלידה
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="instrument">כלי נגינה</Label>
          <select
            id="instrument"
            value={instrumentChoice}
            onChange={(e) => chooseInstrument(e.target.value)}
            className="min-h-12 w-full rounded-2xl border border-ink/20 bg-white px-4 py-3 text-lg"
          >
            <option value="" disabled>
              בחרו כלי
            </option>
            {INSTRUMENTS.map((instrument) => (
              <option key={instrument} value={instrument}>
                {instrument}
              </option>
            ))}
          </select>
          {instrumentChoice === OTHER_INSTRUMENT && (
            <Input
              aria-label="איזה כלי?"
              placeholder="איזה כלי?"
              maxLength={50}
              value={otherInstrument}
              onChange={(e) => setOtherInstrument(e.target.value)}
              onBlur={saveOtherInstrument}
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span id="level-label" className="text-base font-medium">
            רמה
          </span>
          <div role="radiogroup" aria-labelledby="level-label" className="grid grid-cols-3 gap-2">
            {LEVELS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={profile.level === value}
                disabled={busy}
                onClick={() => void persist(() => saveStudentFields(user.uid, { level: value }))}
                className={cn(
                  'min-h-14 rounded-2xl border-2 px-2 py-3 text-lg transition-colors',
                  profile.level === value ? 'border-ink bg-peach' : 'border-ink/15 bg-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {birth && isMinor && (
          <div className="flex flex-col gap-2 rounded-2xl bg-sage px-4 py-4 text-base">
            <p className="font-medium">ההקלטות ייפתחו אחרי שההורה יאשר במייל</p>
            <p>ההורה מאשר פעם אחת בלבד, ואחר כך אפשר להקליט בלי לבקש שוב. בינתיים אפשר לראות מטלות ולתרגל.</p>
          </div>
        )}

        {birth && !isMinor && !profile.consentAt && (
          <label className="flex items-start gap-3 rounded-2xl bg-sage px-4 py-4 text-base">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 size-6 shrink-0 accent-ink"
            />
            <span>
              אני מאשר/ת שהקלטות התרגול יישמרו וישותפו עם המורה שלי.
              <span className="mt-1 block text-sm text-ink/70">
                הקלטות נמחקות אוטומטית אחרי 12 חודשים, ואפשר למחוק אותן קודם.
              </span>
            </span>
          </label>
        )}

        <ErrorNote message={error} />
        <Button type="button" size="large" disabled={!complete || busy} onClick={() => void finish()}>
          סיום
        </Button>
      </div>
    </Screen>
  )
}
