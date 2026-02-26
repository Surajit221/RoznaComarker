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
import { AlertService } from '../../../services/alert.service';
import { Auth, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from '@angular/fire/auth';
import { environment } from '../../../../environments/environment';

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
  private alert = inject(AlertService);
  private firebaseAuth = inject(Auth);

  activeTab: 'general' | 'security' = 'general';

  meName: string = '';
  meId: string = '';
  mePhotoUrl: string = '';

  get avatarUrl(): string {
    const url = this.mePhotoUrl;
    if (!url) return 'img/default-img.png';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${environment.apiUrl}${url}`;
  }

  isSavingProfile = false;
  isUpdatingPassword = false;
  isUploadingAvatar = false;

  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

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
      this.mePhotoUrl = me.photoURL || '';

      this.profileForm.patchValue({
        fullName: me.displayName || '',
        email: me.email || '',
        institution: me.institution || '',
        bio: me.bio || '',
      });

      this.profileForm.controls.email.disable();
    } catch {
      this.meName = '';
      this.meId = '';
      this.mePhotoUrl = '';
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

      const updated = await this.auth.updateMeProfile({
        displayName: payload.fullName,
        institution: payload.institution,
        bio: payload.bio,
      });

      this.meName = updated.displayName || updated.email || '';
      this.meId = updated.id ? String(updated.id) : this.meId;
      this.mePhotoUrl = updated.photoURL || this.mePhotoUrl;
      this.alert.showToast('Profile updated');
    } catch (err: any) {
      this.alert.showError('Failed to update profile', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isSavingProfile = false;
    }
  }

  async onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files && input.files.length > 0 ? input.files[0] : null;
    if (!file) return;
    if (this.isUploadingAvatar) return;

    this.isUploadingAvatar = true;
    try {
      const resp = await this.auth.uploadMyAvatar(file);
      this.mePhotoUrl = resp.photoURL || this.mePhotoUrl;
      this.alert.showToast('Avatar updated');
    } catch (err: any) {
      this.alert.showError('Failed to upload avatar', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isUploadingAvatar = false;
      // allow selecting the same file again
      if (input) input.value = '';
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

      const user = this.firebaseAuth.currentUser;
      if (!user || !user.email) {
        this.alert.showError('Not signed in', 'Please sign in again and try.');
        return;
      }

      const credential = EmailAuthProvider.credential(user.email, payload.currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, payload.newPassword);

      this.alert.showToast('Password updated');
      this.securityForm.reset();
      this.securityForm.markAsPristine();

      await this.auth.logout();
    } catch (err: any) {
      const code = err?.code ? String(err.code) : '';
      const msg =
        code === 'auth/wrong-password'
          ? 'Current password is incorrect.'
          : code === 'auth/requires-recent-login'
            ? 'Please log in again and retry changing your password.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts. Please try again later.'
            : err?.message || 'Please try again.';

      this.alert.showError('Failed to update password', msg);
    } finally {
      this.isUpdatingPassword = false;
    }
  }

  toggleCurrentPassword() {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  toggleNewPassword() {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmPassword() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }
}
