import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { DeviceService } from '../../../services/device.service';
import { AlertService } from '../../../services/alert.service';

const MAX_INVITE_EMAILS = 25;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function parseInviteEmails(value: string): { emails: string[]; invalid: string[]; tooMany: boolean } {
  const entries = value.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  const emails = [...new Set(entries.filter(email => email.length <= 254 && emailPattern.test(email)))];
  return { emails, invalid: entries.filter(email => email.length > 254 || !emailPattern.test(email)),
    tooMany: emails.length > MAX_INVITE_EMAILS };
}
function emailListValidator(control: AbstractControl): ValidationErrors | null {
  const parsed = parseInviteEmails(String(control.value || ''));
  if (parsed.invalid.length) return { invalidEmails: parsed.invalid };
  if (parsed.tooMany) return { tooManyEmails: true };
  return parsed.emails.length ? null : { required: true };
}

@Component({
  selector: 'app-invite-students-dialog',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './invite-students-dialog.html',
  styleUrl: './invite-students-dialog.css',
})
export class InviteStudentsDialog {
  @Input() open = false;
  @Input() classTitle = '';
  @Input() classCode = '';
  @Input() shareLink = '';
  @Output() closed = new EventEmitter<void>();
  @Output() invite = new EventEmitter<string[]>();
  @Input() isSubmitting = false;

  device = inject(DeviceService);
  private fb = inject(FormBuilder);
  private alert = inject(AlertService);

  inviteForm: FormGroup;

  constructor() {
    this.inviteForm = this.fb.group({
      emails: ['', [Validators.required, emailListValidator]]
    });
  }

  get emailsControl() {
    return this.inviteForm.get('emails');
  }

  onClose() {
    this.closed.emit();
    this.resetForm();
  }

  private resetForm() {
    this.inviteForm.reset();
  }

  onSubmit() {
    if (this.isSubmitting) return;
    void this.handleSubmit();
  }

  private async handleSubmit() {
    if (this.inviteForm.invalid) {
      this.markAllFieldsAsTouched();
      return;
    }

    const parsed = parseInviteEmails(String(this.inviteForm.value.emails || ''));
    this.invite.emit(parsed.emails);
  }

  private markAllFieldsAsTouched(): void {
    Object.keys(this.inviteForm.controls).forEach((key) => {
      const control = this.inviteForm.get(key);
      control?.markAsTouched();
    });
  }

  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.alert.showSuccess('Success', 'Copied to clipboard!');
    } catch (err: unknown) {
      this.alert.showError('Failed to copy to clipboard', (err as Error)?.message || 'Please try again');
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.alert.showSuccess('Success', 'Copied to clipboard!');
    }
  }

  copyClassLink() {
    this.copyToClipboard(this.shareLink);
  }

  copyClassCode() {
    this.copyToClipboard(this.classCode);
  }
}
