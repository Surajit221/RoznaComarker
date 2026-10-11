import { TestBed } from '@angular/core/testing';
import { PasswordRequirements } from './password-requirements';

describe('PasswordRequirements', () => {
  for (const [password, completed] of [
    ['', 0], ['abc', 1], ['abcdefgh', 2], ['Abcdefgh', 3], ['Abcdefg1', 4], ['Abcdefg1!', 5],
  ] as const) {
    it(`renders ${completed} completed rules for the QA example`, () => {
      const fixture = TestBed.createComponent(PasswordRequirements);
      fixture.componentRef.setInput('password', password);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelectorAll('li').length).toBe(5);
      expect(element.querySelectorAll('li.complete').length).toBe(completed);
      expect(element.querySelectorAll('li .bx-check-circle').length).toBe(completed);
      expect(element.querySelector('[role="status"]')?.textContent?.trim())
        .toBe(completed === 5 ? 'Password strong' : 'Password not strong');
      expect(element.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
      expect(element.querySelectorAll('.sr-only').length).toBe(5);
    });
  }

  it('updates immediately in both directions and resets to neutral', () => {
    const fixture = TestBed.createComponent(PasswordRequirements);
    for (const [value, count] of [['Abcdef1!', 5], ['abcdef1!', 4], ['', 0]] as const) {
      fixture.componentRef.setInput('password', value);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('li.complete').length).toBe(count);
    }
  });

  it('does not call an overlong password strong', () => {
    const fixture = TestBed.createComponent(PasswordRequirements);
    fixture.componentRef.setInput('password', 'Ab1!' + 'x'.repeat(4093));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.over-limit')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Password not strong');
  });
});
