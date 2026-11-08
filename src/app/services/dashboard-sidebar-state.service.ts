import { Injectable, computed, signal } from '@angular/core';

/** The manual preference survives a temporary correction editor without being overwritten. */
@Injectable({ providedIn: 'root' })
export class DashboardSidebarState {
  private readonly preference = signal(false);
  private readonly correctionEditor = signal(false);
  readonly collapsed = computed(() => this.preference() || this.correctionEditor());

  toggle(): void {
    const next = !this.collapsed();
    this.correctionEditor.set(false);
    this.preference.set(next);
  }

  setCorrectionEditorOpen(open: boolean): void { this.correctionEditor.set(open); }
}
