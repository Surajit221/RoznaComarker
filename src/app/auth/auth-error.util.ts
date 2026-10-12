export type AuthErrorContext = 'signup' | 'login' | 'verification' | 'forgot-password' | 'google';

const messages: Record<string, string> = {
  'auth/email-already-in-use': 'An account already exists for this email. Try logging in instead.',
  'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/user-not-found': 'The email or password is incorrect.',
  'auth/wrong-password': 'The email or password is incorrect.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/too-many-requests': 'Too many attempts. Please wait a while and try again.',
  'auth/network-request-failed': 'We could not reach the server. Check your connection and try again.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.',
  'auth/no-current-user': 'Your sign-in session has expired. Please log in again.'
};

export function authErrorMessage(error: any, context: AuthErrorContext): string {
  const code = String(error?.code || error?.error?.code || error?.error?.error?.code || '');
  if (messages[code]) return messages[code];

  const status = Number(error?.status || 0);
  if (status === 429) return messages['auth/too-many-requests'];
  if (status === 0) return messages['auth/network-request-failed'];
  if (status === 401 && context === 'login') return messages['auth/invalid-credential'];

  if (context === 'verification') return "We couldn't resend the verification email. Please try again shortly.";
  if (context === 'forgot-password') return 'We could not send reset instructions right now. Please try again.';
  if (context === 'google') return 'Google sign-in could not be completed. Please try again.';
  if (context === 'signup') return 'We could not create your account. Please try again.';
  return 'We could not log you in. Please try again.';
}
