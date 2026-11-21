import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SpeakingApiService } from '../../../api/speaking-api.service';
import type { BackendAssignment } from '../../../api/assignment-api.service';
import type { SavedRubric } from '../../../api/rubric-api.service';
import { AudioConfigService } from '../../../services/audio-config.service';
import { DeviceService } from '../../../services/device.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { SpeakingAssignmentsFacade } from '../../../services/speaking-assignments.facade';
import { RubricLibrarySelector } from '../rubric-library-selector/rubric-library-selector';
import { speakingErrorMessage } from '../../../utils/speaking-messages';
import { AlertService } from '../../../services/alert.service';
import { GuestSubmissionFeature, type GuestFeatureState } from '../../../services/guest-submission-feature.service';

const UNSAVED_KEY = 'speaking-assignment-form';

/**
 * Create or edit a speaking assignment (audio + speech-to-text): title, due date, description (the task the answer is marked against),
 * maximum recording length in whole minutes (sent as seconds), show marks, and the rubric (the default speaking rubric or one from the
 * library). Same fields, classes and buttons as the writing assignment form. The rubric of an existing assignment is edited from its card.
 */
@Component({
  selector: 'app-speaking-assignment-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RubricLibrarySelector],
  templateUrl: './speaking-assignment-form.html',
  styleUrl: './speaking-assignment-form.css'
})
export class SpeakingAssignmentForm implements OnInit, OnDestroy {
  @Input() classId: string | null = null;
  @Input() assignment: BackendAssignment | null = null;
  @Output() created = new EventEmitter<BackendAssignment>();
  @Output() updated = new EventEmitter<BackendAssignment>();
  @Output() closed = new EventEmitter<void>();

  private readonly api = inject(SpeakingApiService);
  private readonly config = inject(AudioConfigService);
  private readonly unsaved = inject(UnsavedWorkRegistry);
  private readonly facade = inject(SpeakingAssignmentsFacade, { optional: true });
  private readonly alert = inject(AlertService);
  readonly guestFeature = inject(GuestSubmissionFeature);
  readonly device = inject(DeviceService);
  private readonly fb = inject(FormBuilder);
  private changes?: Subscription;
  /** The form's values (and rubric choice) when it opened; unsaved changes are differences from it. */
  private baseline = '';

  readonly minuteOptions = computed(() => Array.from({ length: this.config.maxMinutes() }, (_, index) => index + 1));
  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    deadline: ['', Validators.required],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    maxMinutes: [this.config.maxMinutes()],
    showMarksToStudent: [true],
    allowGuestSubmission: [false]
  });
  readonly rubric = signal<{ id: string; name: string } | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly submitting = signal(false);
  rubricSelectorOpen = false;

  get editing(): boolean { return Boolean(this.assignment?._id); }

  ngOnInit(): void {
    void this.guestFeature.load();
    const maxMinutes = this.config.maxMinutes();
    if (this.assignment?._id) {
      const seconds = this.assignment.speaking?.maxRecordingSeconds;
      this.form.patchValue({ title: this.assignment.title || '', description: this.assignment.instructions || '',
        deadline: this.assignment.deadline ? String(this.assignment.deadline).slice(0, 10) : '',
        maxMinutes: seconds ? Math.min(maxMinutes, Math.max(1, Math.round(seconds / 60))) : maxMinutes,
        showMarksToStudent: this.assignment.showMarksToStudent !== false, allowGuestSubmission: this.assignment.allowGuestSubmission === true });
    }
    this.baseline = this.snapshot();
    // form.events reports every value change (typing, selects, checkboxes); the registry follows the real difference from the baseline.
    this.changes = this.form.events.subscribe(() => this.syncUnsaved());
  }

  ngOnDestroy(): void { this.changes?.unsubscribe(); this.unsaved.clear(UNSAVED_KEY); this.facade?.busy.set(false); }

  /** True when a field or the rubric choice differs from what the form opened with (changing it back counts as clean). */
  hasUnsavedChanges(): boolean { return this.snapshot() !== this.baseline; }

  /** The page decided to close without saving: nothing of this form is kept or registered any more. */
  discardChanges(): void { this.baseline = this.snapshot(); this.unsaved.clear(UNSAVED_KEY); }

  private snapshot(): string { return JSON.stringify({ ...this.form.getRawValue(), rubric: this.rubric()?.id ?? null }); }

  private syncUnsaved(): void {
    if (this.hasUnsavedChanges()) this.unsaved.register(UNSAVED_KEY, 'You have unsaved changes to this speaking assignment. Leave and discard them?');
    else this.unsaved.clear(UNSAVED_KEY);
  }

  isFieldInvalid(name: 'title' | 'deadline' | 'description'): boolean {
    const field = this.form.get(name);
    return Boolean(field && field.invalid && (field.dirty || field.touched));
  }

  onRubricSelected(rubric: SavedRubric): void { this.rubric.set({ id: rubric._id, name: rubric.name }); this.rubricSelectorOpen = false; this.form.markAsDirty(); this.syncUnsaved(); }
  useDefaultRubric(): void { this.rubric.set(null); this.syncUnsaved(); }

  async submit(): Promise<void> {
    this.errorMessage.set(null);
    if (this.form.invalid || this.submitting()) { this.form.markAllAsTouched(); return; }
    const value = this.form.getRawValue();
    // "Allow submission without login": the writing form's rule (assignment-form.ts guestDecision).
    const guest = this.guestDecision(await this.guestFeature.settled());
    if (guest.block) { this.errorMessage.set("Couldn't check whether guest submission is available. Please try again."); return; }
    const fields = { title: value.title.trim(), instructions: value.description.trim(), deadline: value.deadline, showMarksToStudent: value.showMarksToStudent,
      maxRecordingSeconds: Number(value.maxMinutes) * 60, ...(guest.send !== undefined ? { allowGuestSubmission: guest.send } : {}) };
    this.submitting.set(true); this.facade?.busy.set(true);
    try {
      if (this.assignment?._id) {
        const saved = await this.api.updateSpeakingAssignment(this.assignment._id, fields);
        this.unsaved.clear(UNSAVED_KEY);
        if (guest.warn) this.showGuestOffWarning();
        this.updated.emit(saved);
      } else {
        const saved = await this.api.createSpeakingAssignment({ classId: this.classId || '', ...fields, rubricRef: this.rubric()?.id ?? null });
        this.unsaved.clear(UNSAVED_KEY);
        if (guest.warn) this.showGuestOffWarning();
        this.created.emit(saved);
      }
    } catch (error) {
      this.errorMessage.set(speakingErrorMessage(error));
    } finally {
      this.submitting.set(false); this.facade?.busy.set(false);
    }
  }

  /** Cancel: asks the page to close. The page closes at once when nothing changed, otherwise asks first (then calls discardChanges). */
  close(): void { this.closed.emit(); }

  /**
   * The writing form's rule: send the field only when guest submission is confirmed on; switching it off is always sent (the server always
   * accepts that); otherwise the stored value is kept (an edit) or left off (a create), with a warning if the teacher asked for it.
   */
  private guestDecision(state: GuestFeatureState): { send?: boolean; block?: boolean; warn?: boolean } {
    const wanted = this.form.getRawValue().allowGuestSubmission === true;
    const stored = this.assignment?.allowGuestSubmission === true;
    if (state === 'enabled') return { send: wanted };
    if (wanted === stored) return {};
    if (!wanted) return { send: false };
    return state === 'disabled' ? { warn: true } : { block: true };
  }

  private showGuestOffWarning(): void {
    this.alert.showWarning('Assignment saved without guest access', "Saved without 'submission without login': it's currently turned off.");
  }

  minuteLabel(minutes: number): string { return `${minutes} minute${minutes === 1 ? '' : 's'}`; }
}
