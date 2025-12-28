import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, inject, Output, ViewChild } from '@angular/core';
import { DeviceService } from '../../../../../services/device.service';

@Component({
  selector: 'app-upload-essay-form',
  imports: [CommonModule],
  templateUrl: './upload-essay-form.html',
  styleUrl: './upload-essay-form.css',
})
export class UploadEssayForm {
  @Output() filesSelected = new EventEmitter<File[]>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  device = inject(DeviceService)

  isDragging = false;
  files: { file: File; name: string; size: number; preview?: string }[] = [];

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      this.handleFiles(droppedFiles);
    }
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const selectedFiles = input.files;
    if (selectedFiles && selectedFiles.length > 0) {
      this.handleFiles(selectedFiles);
    }
  }

  handleFiles(fileList: FileList) {
    Array.from(fileList).forEach(file => {
      const newFile = {
        file,
        name: file.name,
        size: file.size,
      };

      // if (file.type.startsWith('image/')) {
      //   const reader = new FileReader();
      //   reader.onload = e => {
      //     newFile['preview'] = e.target?.result as string;
      //   };
      //   reader.readAsDataURL(file);
      // }

      this.files.push(newFile);
    });

    this.filesSelected.emit(this.files.map(f => f.file));
  }

  removeFile(event: Event, index: number) {
    event.stopPropagation();
    this.files.splice(index, 1);
    this.filesSelected.emit(this.files.map(f => f.file));
  }
}
