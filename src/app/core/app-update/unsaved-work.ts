import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';

/**
 * Who has input that would be lost right now. A component registers while a form is dirty or a save is unconfirmed and clears when it
 * is saved or discarded. The update service treats any entry as busy (no automatic reload), and leaving the page asks first.
 * The browser's beforeunload prompt is attached only while something is registered, so it costs nothing otherwise.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedWorkRegistry {
  private readonly document = inject(DOCUMENT);
  private readonly keys = signal<ReadonlySet<string>>(new Set());
  readonly hasWork = computed(() => this.keys().size > 0);

  private readonly beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };

  has(key: string): boolean { return this.keys().has(key); }

  register(key: string): void {
    if (this.keys().has(key)) return;
    if (!this.hasWork()) this.document.defaultView?.addEventListener('beforeunload', this.beforeUnload);
    this.keys.update(keys => new Set(keys).add(key));
  }

  clear(key: string): void {
    if (!this.keys().has(key)) return;
    const next = new Set(this.keys()); next.delete(key);
    this.keys.set(next);
    if (!next.size) this.document.defaultView?.removeEventListener('beforeunload', this.beforeUnload);
  }

  /** The user is about to leave (route change, another submission): true when nothing is unsaved or they agreed to discard it. */
  confirmLeave(): boolean {
    if (!this.hasWork()) return true;
    if (!this.document.defaultView?.confirm('You have unsaved changes to corrections. Leave and discard them?')) return false;
    for (const key of [...this.keys()]) this.clear(key);
    return true;
  }
}

/** Route guard: a dirty form is never lost to a navigation (or to the update applied on one, which runs after guards pass). */
export const unsavedWorkGuard: CanDeactivateFn<unknown> = () => inject(UnsavedWorkRegistry).confirmLeave();
