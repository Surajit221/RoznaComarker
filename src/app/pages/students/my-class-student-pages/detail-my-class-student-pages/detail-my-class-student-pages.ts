import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ModalDialog } from '../../../../shared/modal-dialog/modal-dialog';
import { UploadEssayForm } from './upload-essay-form/upload-essay-form';
import { DeviceService } from '../../../../services/device.service';
import { BottomsheetDialog } from '../../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { AppBarBackButton } from '../../../../shared/app-bar-back-button/app-bar-back-button';

@Component({
  selector: 'app-detail-my-class-student-pages',
  imports: [CommonModule, ModalDialog, UploadEssayForm, BottomsheetDialog, AppBarBackButton],
  templateUrl: './detail-my-class-student-pages.html',
  styleUrl: './detail-my-class-student-pages.css',
})
export class DetailMyClassStudentPages {
  showDialog = false;
  openSheet = false;
  device = inject(DeviceService);

  assignments = [
    {
      title: 'Narrative Perspective: First-Person Draft',
      dueDate: 'Nov, 05 2025',
      submitted: 2,
      total: 10,
      status: 'pending', // warna merah
    },
    {
      title: 'Descriptive Essay: My Favorite Place',
      dueDate: 'Nov, 10 2025',
      submitted: 6,
      total: 10,
      status: 'in-progress', // warna kuning
    },
    {
      title: 'Poetry: Emotion in Words',
      dueDate: 'Nov, 12 2025',
      submitted: 10,
      total: 10,
      status: 'completed', // warna hijau
    },
    {
      title: 'Short Story Draft',
      dueDate: 'Nov, 15 2025',
      submitted: 4,
      total: 10,
      status: 'waiting',
    },
    {
      title: 'Argumentative Essay: Technology Impact',
      dueDate: 'Nov, 20 2025',
      submitted: 5,
      total: 10,
      status: 'in-progress',
    },
    {
      title: 'Final Reflection Paper',
      dueDate: 'Nov, 25 2025',
      submitted: 10,
      total: 10,
      status: 'completed',
    },
    {
      title: 'Creative Writing: Short Poem',
      dueDate: 'Dec, 01 2025',
      submitted: 2,
      total: 10,
      status: 'pending',
    },
    {
      title: 'Essay Draft: My Learning Experience',
      dueDate: 'Dec, 05 2025',
      submitted: 8,
      total: 10,
      status: 'in-progress',
    },
    {
      title: 'Peer Review: Partner Feedback',
      dueDate: 'Dec, 10 2025',
      submitted: 10,
      total: 10,
      status: 'completed',
    },
    {
      title: 'Portfolio Compilation',
      dueDate: 'Dec, 15 2025',
      submitted: 7,
      total: 10,
      status: 'in-progress',
    },
  ];

  constructor(private router: Router) {}

  toMyClasses() {
    this.router.navigate(['/student/my-classes']);
  }

  toViewSubmission() {
    this.router.navigate(['/student/my-classes/detail/my-submissions/:slug']);
  }

  selectedFile: File | null = null;

  selectedFiles: File[] = [];

  onFilesSelected(files: File[]) {
    this.selectedFiles = files;
    console.log('📂 Files terpilih:', files);
  }

  uploadFiles() {
    console.log('🔼 Mengupload ke fake API...');
    this.selectedFiles.forEach((file, i) => {
      console.log(`File ${i + 1}:`, file.name);
    });

    // simulasi upload
    setTimeout(() => {
      alert(`✅ ${this.selectedFiles.length} file berhasil diupload!`);
      this.selectedFiles = [];
    }, 1500);
  }

  closeDialog() {
    this.showDialog = false;
    this.selectedFiles = [];
  }

  onOpenSheet() {
    document.body.classList.add('overflow-hidden');
    this.openSheet = true;
  }

  onCLoseSheet() {
    document.body.classList.remove('overflow-hidden');
    this.openSheet = false;
  }

  handleGoBack() {
    this.router.navigate(['/student/my-classes']); // arahkan ke halaman spesifik
  }
}
