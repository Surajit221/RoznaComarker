import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { DeviceService } from '../../../services/device.service';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../../services/alert.service';
import { Auth, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from '@angular/fire/auth';
import { environment } from '../../../../environments/environment';

import { ClassApiService } from '../../../api/class-api.service';
import { AssignmentApiService } from '../../../api/assignment-api.service';
import { SubmissionApiService } from '../../../api/submission-api.service';
import { FeedbackApiService } from '../../../api/feedback-api.service';

@Component({
  selector: 'app-my-profile-pages',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './my-profile-pages.html',
  styleUrl: './my-profile-pages.css',
})
export class MyProfilePages {
  device = inject(DeviceService);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private alert = inject(AlertService);
  private firebaseAuth = inject(Auth);

  private classApi = inject(ClassApiService);
  private assignmentApi = inject(AssignmentApiService);
  private submissionApi = inject(SubmissionApiService);
  private feedbackApi = inject(FeedbackApiService);

  activeTab: 'general' | 'ai-config' | 'classroom' | 'security' | 'settings' = 'general';

  meName: string = '';
  meId: string = '';
  meEmail: string = '';
  mePhotoUrl: string = '';
  meRoleLabel: string = '';

  totalStudentsCount = 0;
  totalReviewsCount = 0;

  get avatarUrl(): string {
    const url = this.mePhotoUrl;
    if (!url) return 'img/default-img.png';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${environment.apiUrl}${url}`;
  }

  async onSaveAiConfig() {
    if (this.aiConfigForm.invalid) {
      this.aiConfigForm.markAllAsTouched();
      return;
    }
    if (this.isSavingAiConfig) return;

    this.isSavingAiConfig = true;
    try {
      const payload = this.aiConfigForm.getRawValue();
      await this.auth.updateMeProfile({
        aiConfig: {
          strictness: payload.strictness,
          checks: {
            grammarSpelling: payload.grammarSpelling,
            coherenceLogic: payload.coherenceLogic,
            factChecking: payload.factChecking
          }
        }
      });
      this.alert.showToast('AI settings updated');
    } catch (err: any) {
      this.alert.showError('Failed to update AI settings', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isSavingAiConfig = false;
    }
  }

  async onSaveClassroomDefaults() {
    if (this.classroomDefaultsForm.invalid) {
      this.classroomDefaultsForm.markAllAsTouched();
      return;
    }
    if (this.isSavingClassroomDefaults) return;

    this.isSavingClassroomDefaults = true;
    try {
      const payload = this.classroomDefaultsForm.getRawValue();
      await this.auth.updateMeProfile({
        classroomDefaults: {
          gradingScale: payload.gradingScale,
          lateSubmissionPenaltyPercent: payload.lateSubmissionPenaltyPercent,
          autoPublishGrades: payload.autoPublishGrades
        }
      });
      this.alert.showToast('Classroom defaults updated');
    } catch (err: any) {
      this.alert.showError('Failed to update classroom defaults', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isSavingClassroomDefaults = false;
    }
  }

  isSavingProfile = false;
  isSavingAiConfig = false;
  isSavingClassroomDefaults = false;
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

  aiConfigForm = this.fb.nonNullable.group({
    strictness: this.fb.nonNullable.control<'friendly' | 'balanced' | 'strict'>('balanced', {
      validators: [Validators.required]
    }),
    grammarSpelling: this.fb.nonNullable.control(true),
    coherenceLogic: this.fb.nonNullable.control(true),
    factChecking: this.fb.nonNullable.control(false)
  });

  classroomDefaultsForm = this.fb.nonNullable.group({
    gradingScale: this.fb.nonNullable.control<'score_0_100' | 'grade_a_f' | 'pass_fail'>('score_0_100', {
      validators: [Validators.required]
    }),
    lateSubmissionPenaltyPercent: this.fb.nonNullable.control(10, {
      validators: [Validators.required, Validators.min(0), Validators.max(100)]
    }),
    autoPublishGrades: this.fb.nonNullable.control(false)
  });
  notifications: Array<{
    icon: string;
    iconBg: string;
    iconColor: string;
    title: string;
    description: string;
    time: string;
  }> = [];

  async ngOnInit() {
    try {
      const me = await this.auth.getMeProfile();
      this.meName = me.displayName || me.email || '';
      this.meId = me.id ? String(me.id) : '';
      this.meEmail = me.email || '';
      this.mePhotoUrl = me.photoURL || '';
      this.meRoleLabel = typeof me.role === 'string' ? me.role.toUpperCase() : '';

      this.profileForm.patchValue({
        fullName: me.displayName || '',
        email: me.email || '',
        institution: me.institution || '',
        bio: me.bio || '',
      });
      this.profileForm.controls.email.disable();

      const strictness = (me.aiConfig?.strictness === 'friendly' || me.aiConfig?.strictness === 'balanced' || me.aiConfig?.strictness === 'strict')
        ? me.aiConfig.strictness
        : 'balanced';
      this.aiConfigForm.patchValue({
        strictness,
        grammarSpelling: typeof me.aiConfig?.checks?.grammarSpelling === 'boolean' ? me.aiConfig.checks.grammarSpelling : true,
        coherenceLogic: typeof me.aiConfig?.checks?.coherenceLogic === 'boolean' ? me.aiConfig.checks.coherenceLogic : true,
        factChecking: typeof me.aiConfig?.checks?.factChecking === 'boolean' ? me.aiConfig.checks.factChecking : false
      });

      const gradingScale = (me.classroomDefaults?.gradingScale === 'score_0_100' || me.classroomDefaults?.gradingScale === 'grade_a_f' || me.classroomDefaults?.gradingScale === 'pass_fail')
        ? me.classroomDefaults.gradingScale
        : 'score_0_100';
      const latePenalty = typeof me.classroomDefaults?.lateSubmissionPenaltyPercent === 'number'
        ? me.classroomDefaults.lateSubmissionPenaltyPercent
        : 10;
      this.classroomDefaultsForm.patchValue({
        gradingScale,
        lateSubmissionPenaltyPercent: latePenalty,
        autoPublishGrades: typeof me.classroomDefaults?.autoPublishGrades === 'boolean' ? me.classroomDefaults.autoPublishGrades : false
      });

      await this.loadTeacherStats();
    } catch {
      this.meName = '';
      this.meId = '';
      this.meEmail = '';
      this.mePhotoUrl = '';
      this.meRoleLabel = '';

      this.totalStudentsCount = 0;
      this.totalReviewsCount = 0;
    }
  }



  private async loadTeacherStats(): Promise<void> {
    try {
      const classes = await this.classApi.getMyTeacherClasses();
      const classIds = (classes || []).map((c: any) => c?._id).filter((x: any) => typeof x === 'string' && x.length);

      const summaries = await Promise.all(
        classIds.map(async (id: string) => {
          try {
            return await this.classApi.getClassSummary(id);
          } catch {
            return null as any;
          }
        })
      ).then((arr) => arr.filter(Boolean));

      const totalStudents = (summaries || []).reduce((acc: number, s: any) => {
        const n = Number(s?.studentsCount);
        return acc + (Number.isFinite(n) ? n : 0);
      }, 0);

      const assignmentsByClass = await Promise.all(
        classIds.map(async (id: string) => {
          try {
            return await this.assignmentApi.getClassAssignments(id);
          } catch {
            return [] as any[];
          }
        })
      );

      const assignmentIds = assignmentsByClass
        .flat()
        .map((a: any) => a?._id)
        .filter((x: any) => typeof x === 'string' && x.length);

      const submissionsByAssignment = await Promise.all(
        assignmentIds.map(async (assignmentId: string) => {
          try {
            return await this.submissionApi.getSubmissionsByAssignment(assignmentId);
          } catch {
            return [] as any[];
          }
        })
      );

      const submissionIds = submissionsByAssignment
        .flat()
        .map((s: any) => s?._id)
        .filter((x: any) => typeof x === 'string' && x.length);

      const feedbacks = await Promise.all(
        submissionIds.map(async (submissionId: string) => {
          try {
            return await this.feedbackApi.getSubmissionFeedback(submissionId);
          } catch {
            return null as any;
          }
        })
      ).then((arr) => arr.filter(Boolean));

      const reviewsCount = (feedbacks || []).filter((fb: any) => fb?.overriddenByTeacher === true).length;

      this.totalStudentsCount = Number.isFinite(totalStudents) ? totalStudents : 0;
      this.totalReviewsCount = Number.isFinite(reviewsCount) ? reviewsCount : 0;
    } catch {
      this.totalStudentsCount = 0;
      this.totalReviewsCount = 0;
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
    if (this.isSavingProfile) return;

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
      if (input) input.value = '';
    }
  }

  async onUpdatePassword() {
    if (this.securityForm.invalid) {
      this.securityForm.markAllAsTouched();
      return;
    }
    if (this.isUpdatingPassword) return;

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

  async onLogout() {
    await this.auth.logout();
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
