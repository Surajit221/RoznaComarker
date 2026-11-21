import { EventEmitter, Injectable, computed, inject, signal } from '@angular/core';
import { AudioConfigService } from './audio-config.service';
import { AlertService } from './alert.service';
import { SpeakingApiService } from '../api/speaking-api.service';
import { RubricApiService, type SavedRubric } from '../api/rubric-api.service';
import type { BackendAssignment } from '../api/assignment-api.service';
import type { RubricDesigner } from '../models/submission-feedback.model';
import { designerToRubricData, rubricDataToDesigner } from '../utils/rubric-library.util';
import type { AssignmentKind } from '../components/teacher/assignment-type-choice/assignment-type-choice';

/** The description that marks a saved rubric as "this assignment's own copy" (made from its card). */
export const rubricCopyMarker = (assignmentId: string) => `Speaking rubric for assignment ${assignmentId}`;

type Step = 'idle' | 'choice' | 'writing' | 'speaking';

/**
 * Everything speaking on the teacher's class page, so the page itself only gains small @if branches:
 * - the create/edit flow: with the feature off it goes straight to the writing form (the page is exactly as before); with it on, the
 *   choice comes first; editing a speaking assignment opens the speaking form;
 * - the Rubric button on a speaking card: copy for this assignment. The first save creates a saved copy marked for this assignment and
 *   attaches it (PATCH speaking.rubricRef); later saves edit that copy. A shared rubric (the seeded default, another assignment's copy or
 *   a library rubric) is never changed from a card. Fixed messages only.
 */
@Injectable({ providedIn: 'root' })
export class SpeakingAssignmentsFacade {
  private readonly config = inject(AudioConfigService);
  private readonly speakingApi = inject(SpeakingApiService);
  private readonly rubricApi = inject(RubricApiService);
  private readonly alert = inject(AlertService);

  readonly step = signal<Step>('idle');
  readonly editing = signal<BackendAssignment | null>(null);
  readonly busy = signal(false);
  readonly enabled = this.config.enabled;
  /** The longest recording allowed, in minutes (shown on the Speaking choice card). */
  readonly maxMinutes = computed(() => this.config.maxMinutes());
  readonly hideWritingForm = computed(() => this.step() === 'choice' || this.step() === 'speaking');
  readonly createButtonLabel = computed(() => (this.config.enabled() ? 'Create Assignment' : 'Create Writing Assignment'));

  readonly rubricOpen = signal(false);
  readonly rubricDesigner = signal<RubricDesigner | null>(null);
  readonly rubricSaving = signal(false);
  /** An assignment whose rubric reference changed (the page updates its copy of it). */
  readonly assignmentChanged = new EventEmitter<BackendAssignment>();
  private rubricTarget: { assignment: BackendAssignment; rubric: SavedRubric; ownCopy: boolean } | null = null;

  load(): Promise<void> { return this.config.load(); }

  isSpeaking(item: { resourceType?: string } | null | undefined): boolean { return item?.resourceType === 'speaking'; }

  startCreate(): void { this.editing.set(null); this.step.set(this.config.enabled() ? 'choice' : 'writing'); }
  startEdit(assignment: BackendAssignment): void { this.editing.set(assignment); this.step.set(this.isSpeaking(assignment) ? 'speaking' : 'writing'); }
  choose(kind: AssignmentKind): void { this.step.set(kind); }
  reset(): void { this.step.set('idle'); this.editing.set(null); this.busy.set(false); }

  /** The dialog title: the page's own title for the writing form, unchanged. */
  dialogTitle(writingTitle: string): string {
    if (this.step() === 'choice') return 'Create Assignment';
    if (this.step() === 'speaking') return this.editing() ? 'Edit Speaking Assignment' : 'Create Speaking Assignment';
    return writingTitle;
  }

  async openRubric(assignment: BackendAssignment): Promise<void> {
    const ref = assignment.speaking?.rubricRef;
    let rubric: SavedRubric | null = null;
    try { rubric = ref ? await this.rubricApi.getSavedRubric(ref) : null; } catch { rubric = null; }
    if (!rubric?.rubricData?.criteria?.length) {
      this.alert.showError('Rubric unavailable', "This assignment's rubric can't be opened here. Refresh the page and try again.");
      return;
    }
    this.rubricTarget = { assignment, rubric, ownCopy: rubric.description === rubricCopyMarker(assignment._id) };
    this.rubricDesigner.set(rubricDataToDesigner(rubric.rubricData, rubric.name));
    this.rubricOpen.set(true);
  }

  closeRubric(): void { if (!this.rubricSaving()) { this.rubricOpen.set(false); this.rubricTarget = null; } }

  async saveRubric(designer: RubricDesigner): Promise<void> {
    const target = this.rubricTarget;
    if (!target || this.rubricSaving()) return;
    this.rubricSaving.set(true);
    try {
      const rubricData = designerToRubricData(designer);
      if (target.ownCopy) {
        await this.rubricApi.updateSavedRubric(target.rubric._id, { rubricData });
      } else {
        const copy = await this.rubricApi.createSavedRubric({ name: `${target.assignment.title} (speaking rubric)`.slice(0, 120),
          description: rubricCopyMarker(target.assignment._id), writingType: 'speaking', rubricData });
        const updated = await this.speakingApi.attachRubric(target.assignment._id, copy._id);
        this.assignmentChanged.emit({ ...target.assignment, ...updated, speaking: { maxRecordingSeconds: target.assignment.speaking?.maxRecordingSeconds ?? null,
          ...(updated?.speaking || {}), rubricRef: copy._id } });
      }
      this.alert.showToast('Rubric saved for this assignment', 'success');
      this.rubricSaving.set(false);
      this.rubricOpen.set(false); this.rubricTarget = null;
    } catch {
      this.rubricSaving.set(false);
      this.alert.showError('Rubric not saved', 'The rubric could not be saved. Check that the weights add up to 100 and every level has a description.');
    }
  }
}
