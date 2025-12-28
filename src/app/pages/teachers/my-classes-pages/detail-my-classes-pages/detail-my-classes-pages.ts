import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ModalDialog } from '../../../../shared/modal-dialog/modal-dialog';
import { AssignmentForm } from './assignment-form/assignment-form';
import { DialogQrClasses } from './dialog-qr-classes/dialog-qr-classes';
import { DialogViewSubmissions } from './dialog-view-submissions/dialog-view-submissions';
import { DeviceService } from '../../../../services/device.service';
import { AppBarBackButton } from '../../../../shared/app-bar-back-button/app-bar-back-button';
import { BottomsheetDialog } from '../../../../shared/bottomsheet-dialog/bottomsheet-dialog';

@Component({
  selector: 'app-detail-my-classes-pages',
  imports: [
    CommonModule,
    ModalDialog,
    AssignmentForm,
    DialogQrClasses,
    DialogViewSubmissions,
    AppBarBackButton,
    BottomsheetDialog,
  ],
  templateUrl: './detail-my-classes-pages.html',
  styleUrl: './detail-my-classes-pages.css',
})
export class DetailMyClassesPages {
  showDialog = false;
  showDialogSubmission = false;
  showDialogQRClasses = false;
  device = inject(DeviceService);
  isButtonFabOpen = false;
  openSheetAssignment = false;
  openSheetQr = false;
  openSheetSubmission = false;

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
      status: 'pending',
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

  students = [
    {
      name: 'Sarah Connor',
      image: 'https://randomuser.me/api/portraits/women/1.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'John Reese',
      image: 'https://randomuser.me/api/portraits/men/12.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'Emily Stone',
      image: 'https://randomuser.me/api/portraits/women/8.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'Michael Lee',
      image: 'https://randomuser.me/api/portraits/men/9.jpg',
      status: 'INVITED',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'Sophia Brown',
      image: 'https://randomuser.me/api/portraits/women/5.jpg',
      status: 'ACTIVE',
      submitted: 3,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'Ethan Davis',
      image: 'https://randomuser.me/api/portraits/men/7.jpg',
      status: 'INVITED',
      submitted: 2,
      total: 4,
      lastActivity: 'Nov 04, 2025',
    },
    {
      name: 'Ava Johnson',
      image: 'https://randomuser.me/api/portraits/women/9.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'Noah Wilson',
      image: 'https://randomuser.me/api/portraits/men/3.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 03, 2025',
    },
    {
      name: 'Isabella Martinez',
      image: 'https://randomuser.me/api/portraits/women/6.jpg',
      status: 'INVITED',
      submitted: 1,
      total: 4,
      lastActivity: 'Nov 02, 2025',
    },
    {
      name: 'Liam Anderson',
      image: 'https://randomuser.me/api/portraits/men/2.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 01, 2025',
    },
  ];

  constructor(private router: Router) {}

  toMyClasses() {
    this.router.navigate(['/teacher/my-classes']);
  }

  toStudentProfile() {
    this.router.navigate(['/teacher/my-classes/detail/student-profile/nana']);
  }

  onAddAssignment() {
    this.showDialog = true;
  }

  onOpenSubmission() {
    this.showDialogSubmission = true;
  }

  onOpenQRClasses() {
    this.showDialogQRClasses = true;
  }

  closeDialog() {
    this.showDialog = false;
  }

  closeDialogSubmission() {
    this.showDialogSubmission = false;
  }

  closeDialogQRClasses() {
    this.showDialogQRClasses = false;
  }

  viewSubmissions() {}

  onCloseCreateAssignment() {
    document.body.classList.remove('overflow-hidden');
    this.openSheetAssignment = false;
  }

  onOpenCreateNewAssignment() {
    document.body.classList.add('overflow-hidden');
    this.openSheetAssignment = true;
  }

  onCloseQR() {
    document.body.classList.remove('overflow-hidden');
    this.openSheetQr = false;
  }

  onOpenQR() {
    document.body.classList.add('overflow-hidden');
    this.openSheetQr = true;
  }

  onCloseSubmission() {
    document.body.classList.remove('overflow-hidden');
    this.openSheetSubmission = false;
  }

  onOpenSheetSubmission() {
    document.body.classList.add('overflow-hidden');
    this.openSheetSubmission = true;
  }

  handleGoBack() {
    this.router.navigate(['/student/my-classes']);
  }
}
