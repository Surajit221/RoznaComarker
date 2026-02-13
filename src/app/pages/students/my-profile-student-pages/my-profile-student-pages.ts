import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../auth/auth.service';
import { DeviceService } from '../../../services/device.service';

@Component({
  selector: 'app-my-profile-student-pages',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './my-profile-student-pages.html',
  styleUrl: './my-profile-student-pages.css',
})
export class MyProfileStudentPages {
  device = inject(DeviceService);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);

  activeTab: 'general' | 'security' = 'general';

  meName: string = '';
  meId: string = '';

  isSavingProfile = false;
  isUpdatingPassword = false;

  profileForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    institution: ['', [Validators.required, Validators.maxLength(160)]],
    bio: ['', [Validators.maxLength(1000)]],
  });

  securityForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required, Validators.minLength(6)]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required, Validators.minLength(6)]],
    },
    { validators: [this.passwordMatchValidator] }
  );

  async ngOnInit() {
    try {
      const me = await this.auth.getMeProfile();
      this.meName = me.displayName || me.email || '';
      this.meId = me.id ? String(me.id) : '';

      this.profileForm.patchValue({
        fullName: me.displayName || '',
        email: me.email || '',
      });
    } catch {
      this.meName = '';
      this.meId = '';
    }
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    if (!newPassword || !confirmPassword) return null;
    return newPassword === confirmPassword ? null : { passwordMismatch: true };
  }

  async onSaveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSavingProfile = true;
    try {
      const payload = this.profileForm.getRawValue();
      void payload;
      // TODO: integrate API call
    } finally {
      this.isSavingProfile = false;
    }
  }

  async onUpdatePassword() {
    if (this.securityForm.invalid) {
      this.securityForm.markAllAsTouched();
      return;
    }

    this.isUpdatingPassword = true;
    try {
      const payload = this.securityForm.getRawValue();
      void payload;
      // TODO: integrate API call
      this.securityForm.reset();
    } finally {
      this.isUpdatingPassword = false;
    }
  }
}
