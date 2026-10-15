// Turns Firebase Auth error codes into short Hebrew messages.
// Returns null for errors the user caused on purpose (closing the Google window).
export function authErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'האימייל או הסיסמה לא נכונים. אפשר לנסות שוב.'
    case 'auth/email-already-in-use':
      return 'כבר יש חשבון עם האימייל הזה. אפשר להיכנס אליו.'
    case 'auth/weak-password':
      return 'הסיסמה קצרה או חלשה מדי. כדאי לבחור סיסמה ארוכה יותר.'
    case 'auth/too-many-requests':
      return 'היו יותר מדי ניסיונות. כדאי לחכות כמה דקות ולנסות שוב.'
    case 'auth/network-request-failed':
      return 'אין חיבור לאינטרנט. כדאי לבדוק ולנסות שוב.'
    case 'auth/popup-blocked':
      return 'הדפדפן חסם את חלון ההתחברות. אפשר לאשר חלונות קופצים ולנסות שוב.'
    case 'auth/user-disabled':
      return 'החשבון הזה הושבת. אפשר לפנות אלינו.'
    default:
      return 'משהו השתבש. אפשר לנסות שוב.'
  }
}
