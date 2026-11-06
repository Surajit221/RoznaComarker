import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { AnnotationControls } from './annotation-controls';
import { MESSAGE_MAX, SUGGESTION_MAX } from './annotation-editor.logic';

/**
 * The fields of the editor's one form (category and symbol, explanation, suggestion), with Save and Cancel. It holds no state of its own:
 * everything is read from and written to AnnotationControls (form, validateForm errors, saveForm, cancelForm), so the rules, the request
 * (requestId, revision, sourceHash), conflict handling and the UnsavedWork guard are the editor's existing ones.
 * `inline`: shown in a popup or a list row instead of the panel; it says which correction it edits, shows failures next to the fields,
 * and offers "Change the words…" (the panel form, which can select words). Text is rendered by interpolation only.
 */
@Component({
  selector: 'app-annotation-edit-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './annotation-edit-fields.html',
  styleUrl: './annotation-edit-fields.css',
})
export class AnnotationEditFields {
  readonly controls = input.required<AnnotationControls>();
  readonly inline = input(false);
  readonly MESSAGE_MAX = MESSAGE_MAX;
  readonly SUGGESTION_MAX = SUGGESTION_MAX;

  /** Escape cancels (and is not passed on, so the popup around it stays). Enter saves in a one-line field; Ctrl/Cmd+Enter in the explanation. */
  onKeydown(event: KeyboardEvent, singleLine: boolean): void {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      this.controls().cancelForm();
    } else if (event.key === 'Enter' && (singleLine || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.controls().saveForm();
    }
  }
  value(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value; }
}
