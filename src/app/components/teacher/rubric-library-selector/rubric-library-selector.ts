import { CommonModule } from '@angular/common';
import { Component, computed, EventEmitter, inject, Input, Output, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalDialog } from '../../../shared/modal-dialog/modal-dialog';
import { RubricLibraryStateService } from '../../../services/rubric-library-state.service';
import type { SavedRubric } from '../../../api/rubric-api.service';

@Component({
  selector: 'app-rubric-library-selector', standalone: true,
  imports: [CommonModule, FormsModule, ModalDialog],
  templateUrl: './rubric-library-selector.html', styleUrl: './rubric-library-selector.css'
})
export class RubricLibrarySelector {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() selected = new EventEmitter<SavedRubric>();
  readonly state = inject(RubricLibraryStateService);
  readonly search = signal('');
  readonly preview = signal<SavedRubric | null>(null);
  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    return query ? this.state.rubrics().filter((item) => item.name.toLowerCase().includes(query)) : this.state.rubrics();
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) void this.state.load();
  }
  criterionCount(item: SavedRubric): number { return item.rubricData.criteria.length; }
  use(item: SavedRubric): void { this.selected.emit(item); }
}
