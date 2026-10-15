export const OTHER_INSTRUMENT = 'אחר'

// Closed list for easy choosing; "אחר" lets the student type their own.
export const INSTRUMENTS = ['פסנתר', 'גיטרה', 'כינור', 'צ׳לו', 'חליל', 'תופים', 'שירה', OTHER_INSTRUMENT] as const

export const LEVELS = [
  { value: 'beginner', label: 'מתחיל/ה' },
  { value: 'intermediate', label: 'בינוני/ת' },
  { value: 'advanced', label: 'מתקדם/ת' },
] as const

export type Level = (typeof LEVELS)[number]['value']
