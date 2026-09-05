import { Injectable, inject, signal } from '@angular/core';
import { RubricApiService, type SavedRubric } from '../api/rubric-api.service';

@Injectable({ providedIn: 'root' })
export class RubricLibraryStateService {
  private readonly api = inject(RubricApiService);
  readonly rubrics = signal<SavedRubric[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly pendingForAssignment = signal<SavedRubric | null>(null);

  async load(search = ''): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.rubrics.set(await this.api.listSavedRubrics(search)); }
    catch (error: any) { this.error.set(error?.error?.message || 'Unable to load saved rubrics.'); }
    finally { this.loading.set(false); }
  }

  upsert(rubric: SavedRubric): void {
    this.rubrics.update((items) => [rubric, ...items.filter((item) => item._id !== rubric._id)]);
  }

  remove(id: string): void { this.rubrics.update((items) => items.filter((item) => item._id !== id)); }
  useForNextAssignment(rubric: SavedRubric): void { this.pendingForAssignment.set(rubric); }
  consumeForAssignment(): SavedRubric | null {
    const rubric = this.pendingForAssignment();
    this.pendingForAssignment.set(null);
    return rubric;
  }
}
