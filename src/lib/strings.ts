// Product name in one place, in case it changes.
export const APP_NAME = 'אטונלי'
export const APP_TAGLINE = 'תרגול מוזיקה בין השיעורים'

export const MIN_PASSWORD_LENGTH = 8
export const MAX_NAME_LENGTH = 60

// The one place for the privacy contact address (see CLAUDE.md). Until a real address
// exists it ends in ".invalid" and the screens leave the contact sentence out.
export const PRIVACY_CONTACT_EMAIL = 'privacy@example.invalid'
export const HAS_PRIVACY_CONTACT = !PRIVACY_CONTACT_EMAIL.endsWith('.invalid')
export const CONSENT_TEXT_VERSION = 1
