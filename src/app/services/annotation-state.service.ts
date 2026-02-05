import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';

import type { FeedbackAnnotation } from '../models/feedback-annotation.model';

export type AnnotationSymbolFilter = {
  group?: string;
  symbol?: string;
} | null;

@Injectable({
  providedIn: 'root'
})
export class AnnotationStateService {
  private readonly annotationsSubject = new BehaviorSubject<FeedbackAnnotation[]>([]);
  private readonly activeSymbolFilterSubject = new BehaviorSubject<AnnotationSymbolFilter>(null);

  readonly annotations$: Observable<FeedbackAnnotation[]> = this.annotationsSubject.asObservable();
  readonly activeSymbolFilter$: Observable<AnnotationSymbolFilter> = this.activeSymbolFilterSubject.asObservable();

  readonly filteredAnnotations$: Observable<FeedbackAnnotation[]> = this.getFilteredAnnotations();

  setAnnotations(annotations: FeedbackAnnotation[] | null | undefined): void {
    this.annotationsSubject.next(Array.isArray(annotations) ? annotations : []);
  }

  getFilteredAnnotations(): Observable<FeedbackAnnotation[]> {
    return combineLatest([this.annotations$, this.activeSymbolFilter$]).pipe(
      map(([annotations, filter]) => this.applyFilters(annotations, filter))
    );
  }

  setActiveSymbolFilter(filter: AnnotationSymbolFilter): void {
    if (!filter) {
      this.activeSymbolFilterSubject.next(null);
      return;
    }

    const group = typeof filter.group === 'string' ? filter.group : undefined;
    const symbol = typeof filter.symbol === 'string' ? filter.symbol : undefined;

    this.activeSymbolFilterSubject.next({
      group: group && group.trim() ? group.trim() : undefined,
      symbol: symbol && symbol.trim() ? symbol.trim() : undefined,
    });
  }

  clearFilters(): void {
    this.activeSymbolFilterSubject.next(null);
  }

  private applyFilters(annotations: FeedbackAnnotation[], filter: AnnotationSymbolFilter): FeedbackAnnotation[] {
    if (!filter) return annotations;

    const targetSymbol = (filter.symbol || '').trim().toUpperCase();
    const targetGroup = (filter.group || '').trim().toUpperCase();

    return annotations.filter((a) => {
      if (!a) return false;

      const sym = (a.symbol || '').trim().toUpperCase();
      const grp = (a.group || '').trim().toUpperCase();

      if (targetSymbol && sym !== targetSymbol) return false;
      if (targetGroup) {
        // Match either exact group or label-ish group (some backends send "GRAMMAR" vs "Grammar")
        if (!grp) return false;
        if (grp !== targetGroup) return false;
      }

      return true;
    });
  }
}
