import { ValidatorFn } from '@angular/forms';

// UI policy for new passwords only. Firebase remains the security authority;
// see PASSWORD_POLICY_QA.md for the provider enforcement prerequisite.
export const PASSWORD_MAX_LENGTH = 4096;
export const PASSWORD_REQUIREMENTS = [
  { key: 'minLength', label: '8 characters' },
  { key: 'uppercase', label: '1 uppercase letter' },
  { key: 'lowercase', label: '1 lowercase letter' },
  { key: 'number', label: '1 number' },
  { key: 'specialCharacter', label: '1 special character' },
] as const;

export function evaluatePasswordRequirements(password: string) {
  const requirements = {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    specialCharacter: /[^A-Za-z0-9]/.test(password),
  };
  const withinMaxLength = password.length <= PASSWORD_MAX_LENGTH;
  return { requirements, withinMaxLength, valid: withinMaxLength && Object.values(requirements).every(Boolean) };
}

export const newPasswordValidator: ValidatorFn = control =>
  evaluatePasswordRequirements(typeof control.value === 'string' ? control.value : '').valid
    ? null : { passwordRequirements: true };

export function assertNewPassword(password: string): void {
  if (!evaluatePasswordRequirements(password).valid) {
    throw Object.assign(new Error('Your password does not meet the security requirements.'), {
      code: 'auth/password-does-not-meet-requirements',
    });
  }
}
