import { Component, Input } from '@angular/core';
import { evaluatePasswordRequirements, PASSWORD_MAX_LENGTH, PASSWORD_REQUIREMENTS } from '../../auth/password-policy.util';

@Component({
  selector: 'app-password-requirements',
  template: `
    <section class="requirements" aria-label="New password requirements">
      <p class="heading">The new password should have at least:</p>
      <ul>
        @for (rule of rules; track rule.key) {
          <li [class.complete]="state.requirements[rule.key]">
            <i class="bx" [class.bx-check-circle]="state.requirements[rule.key]"
              [class.bx-circle]="!state.requirements[rule.key]" aria-hidden="true"></i>
            <span>{{ rule.label }}</span>
            <span class="sr-only">{{ state.requirements[rule.key] ? ' — met' : ' — not met' }}</span>
          </li>
        }
      </ul>
      <p class="limit" [class.over-limit]="!state.withinMaxLength">Maximum {{ maxLength }} characters.</p>
      <p class="status" [class.complete]="state.valid" role="status" aria-live="polite" aria-atomic="true">
        {{ state.valid ? 'Password strong' : 'Password not strong' }}
      </p>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .requirements { border: 2px solid #e7e7e7; border-radius: 1rem; padding: 1rem; background: #f8fafb; color: #595959; font-size: .875rem; overflow-wrap: anywhere; }
    .heading { font-weight: 600; margin: 0 0 .75rem; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .375rem; }
    li { display: flex; align-items: center; gap: .5rem; }
    i { flex: 0 0 auto; font-size: 1.125rem; }
    .complete { color: #006d6e; font-weight: 600; }
    .limit { font-size: .75rem; margin: .75rem 0 0; }
    .over-limit { color: #b42318; font-weight: 600; }
    .status { border-top: 1px solid #e7e7e7; margin: .75rem 0 0; padding-top: .75rem; font-weight: 600; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  `,
})
export class PasswordRequirements {
  readonly rules = PASSWORD_REQUIREMENTS;
  readonly maxLength = PASSWORD_MAX_LENGTH;
  state = evaluatePasswordRequirements('');

  @Input() set password(value: string | null | undefined) {
    this.state = evaluatePasswordRequirements(value ?? '');
  }
}
