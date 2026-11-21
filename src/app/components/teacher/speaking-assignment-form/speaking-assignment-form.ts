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
  readonly device = inject(DeviceService);
  private readonly fb = inject(FormBuilder);
  private changes?: Subscription;

  readonly minuteOptions = computed(() => Array.from({ length: this.config.maxMinutes() }, (_, index) => index + 1));
  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    deadline: ['', Validators.required],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    maxMinutes: [this.config.maxMinutes()],
    showMarksToStudent: [true]
  });
  readonly rubric = signal<{ id: string; name: string } | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly submitting = signal(false);
  rubricSelectorOpen = false;

  get editing(): boolean { return Boolean(this.assignment?._id); }

  ngOnInit(): void {
    const maxMinutes = this.config.maxMinutes();
    if (this.assignment?._id) {
      const seconds = this.assignment.speaking?.maxRecordingSeconds;
      this.form.patchValue({ title: this.assignment.title || '', description: this.assignment.instructions || '',
        deadline: this.assignment.deadline ? String(this.assignment.deadline).slice(0, 10) : '',
        maxMinutes: seconds ? Math.min(maxMinutes, Math.max(1, Math.round(seconds / 60))) : maxMinutes,
        showMarksToStudent: this.assignment.showMarksToStudent !== false });
    }
    // form.events also reports a control becoming dirty (not only value changes), so a change is never missed.
    this.changes = this.form.events.subscribe(() => {
      if (this.form.dirty) this.unsaved.register(UNSAVED_KEY, 'You have unsaved changes to this speaking assignment. Leave and discard them?');
    });
  }

  ngOnDestroy(): void { this.changes?.unsubscribe(); this.unsaved.clear(UNSAVED_KEY); this.facade?.busy.set(false); }

  isFieldInvalid(name: 'title' | 'deadline' | 'description'): boolean {
    const field = this.form.get(name);
    return Boolean(field && field.invalid && (field.dirty || field.touched));
  }

  onRubricSelected(rubric: SavedRubric): void { this.rubric.set({ id: rubric._id, name: rubric.name }); this.rubricSelectorOpen = false; this.form.markAsDirty(); }
  useDefaultRubric(): void { this.rubric.set(null); }

  async submit(): Promise<void> {
    this.errorMessage.set(null);
    if (this.form.invalid || this.submitting()) { this.form.markAllAsTouched(); return; }
    const value = this.form.getRawValue();
    const fields = { title: value.title.trim(), instructions: value.description.trim(), deadline: value.deadline, showMarksToStudent: value.showMarksToStudent,
      maxRecordingSeconds: Number(value.maxMinutes) * 60 };
    this.submitting.set(true); this.facade?.busy.set(true);
    try {
      if (this.assignment?._id) {
        const saved = await this.api.updateSpeakingAssignment(this.assignment._id, fields);
        this.unsaved.clear(UNSAVED_KEY);
        this.updated.emit(saved);
      } else {
        const saved = await this.api.createSpeakingAssignment({ classId: this.classId || '', ...fields, rubricRef: this.rubric()?.id ?? null });
        this.unsaved.clear(UNSAVED_KEY);
        this.created.emit(saved);
      }
    } catch (error) {
      this.errorMessage.set(speakingErrorMessage(error));
    } finally {
      this.submitting.set(false); this.facade?.busy.set(false);
    }
  }

  close(): void { this.unsaved.clear(UNSAVED_KEY); this.closed.emit(); }

  minuteLabel(minutes: number): string { return `${minutes} minute${minutes === 1 ? '' : 's'}`; }
}
