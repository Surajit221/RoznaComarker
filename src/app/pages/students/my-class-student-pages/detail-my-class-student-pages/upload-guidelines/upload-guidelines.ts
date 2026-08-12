import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-upload-guidelines',
  templateUrl: './upload-guidelines.html',
  styleUrl: './upload-guidelines.css',
})
export class UploadGuidelines {
  @Output() closed = new EventEmitter<void>();
}
