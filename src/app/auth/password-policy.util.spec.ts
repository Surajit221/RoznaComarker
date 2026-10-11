import { FormControl } from '@angular/forms';
import { assertNewPassword, evaluatePasswordRequirements, newPasswordValidator } from './password-policy.util';

describe('New password UI policy', () => {
  for (const password of ['Abcdef1!', 'Example@123', 'Abcdef1-', 'Abcdef1+', 'Abcdef1=', 'Abcdef1 ', 'Abcdef1é']) {
    it(`accepts compliant example including unrestricted special characters: ${JSON.stringify(password)}`, () => {
      expect(evaluatePasswordRequirements(password).valid).toBeTrue();
      expect(() => assertNewPassword(password)).not.toThrow();
    });
  }

  for (const [password, missing] of [
    ['Ab1!', 'minLength'], ['abcdef1!', 'uppercase'], ['ABCDEF1!', 'lowercase'],
    ['Abcdefg!', 'number'], ['Abcdef12', 'specialCharacter'],
  ] as const) {
    it(`rejects a password missing ${missing}`, () => {
      const result = evaluatePasswordRequirements(password);
      expect(result.valid).toBeFalse();
      expect(result.requirements[missing]).toBeFalse();
      expect(new FormControl(password, newPasswordValidator).invalid).toBeTrue();
      expect(() => assertNewPassword(password)).toThrowError('Your password does not meet the security requirements.');
    });
  }

  it('preserves Firebase maximum length without trimming passwords', () => {
    expect(evaluatePasswordRequirements('Ab1!' + 'x'.repeat(4092)).valid).toBeTrue();
    expect(evaluatePasswordRequirements('Ab1!' + 'x'.repeat(4093)).valid).toBeFalse();
    expect(evaluatePasswordRequirements('Abcdef1 ').valid).toBeTrue();
  });

  it('handles empty and reset form controls', () => {
    expect(Object.values(evaluatePasswordRequirements('').requirements)).toEqual([false, false, false, false, false]);
    expect(new FormControl(null, newPasswordValidator).invalid).toBeTrue();
  });
});
