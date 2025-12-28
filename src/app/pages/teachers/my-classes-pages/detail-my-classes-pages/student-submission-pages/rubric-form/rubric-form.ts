import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-rubric-form',
  imports: [],
  templateUrl: './rubric-form.html',
  styleUrl: './rubric-form.css',
})
export class RubricForm {
  @Output() closed = new EventEmitter<void>();

  closeDialog() {
    this.closed.emit();
  }
}
