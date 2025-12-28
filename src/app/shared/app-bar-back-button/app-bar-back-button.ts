import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-app-bar-back-button',
  imports: [],
  templateUrl: './app-bar-back-button.html',
  styleUrl: './app-bar-back-button.css',
})
export class AppBarBackButton {
  @Input() title = '';
  @Output() back = new EventEmitter<void>();

  onBackClick() {
    this.back.emit();
  }
}
