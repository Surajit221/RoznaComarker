import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { DeviceService } from '../../../services/device.service';
import { AlertService } from '../../../services/alert.service';

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

  device = inject(DeviceService);
  private fb = inject(FormBuilder);
  private alert = inject(AlertService);

  inviteForm: FormGroup;
  isSubmitting = false;

  constructor() {
    this.inviteForm = this.fb.group({
      emails: ['', [Validators.required, Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)]]
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
    this.isSubmitting = false;
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

    try {
      this.isSubmitting = true;

      const emailsText = this.inviteForm.value.emails || '';
      const emails = emailsText
        .split(',')
        .map((email: string) => email.trim())
        .filter((email: string) => email.length > 0);

      if (emails.length === 0) {
        this.alert.showError('No emails', 'Please enter at least one email address.');
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = emails.filter((email: string) => !emailRegex.test(email));
      
      if (invalidEmails.length > 0) {
        this.alert.showError('Invalid emails', `The following email addresses are invalid: ${invalidEmails.join(', ')}`);
        return;
      }

      this.invite.emit(emails);
      this.onClose();

    } catch (err: any) {
      this.alert.showError('Failed to send invitations', (err as Error)?.message || 'Please try again');
    } finally {
      this.isSubmitting = false;
    }
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
    } catch (err: any) {
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
