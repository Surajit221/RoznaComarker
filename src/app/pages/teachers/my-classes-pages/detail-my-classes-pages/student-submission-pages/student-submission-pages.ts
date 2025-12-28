import { Component, EventEmitter, inject, Output } from '@angular/core';
import { Router } from '@angular/router';
import { ModalDialog } from '../../../../../shared/modal-dialog/modal-dialog';
import { RubricForm } from './rubric-form/rubric-form';
import { DeviceService } from '../../../../../services/device.service';
import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';
import { CommonModule } from '@angular/common';
import { DialogViewSubmissions } from '../dialog-view-submissions/dialog-view-submissions';
import { BottomsheetDialog } from '../../../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { EssayImages } from '../../../../../components/teacher/essay-images/essay-images';

@Component({
  selector: 'app-student-submission-pages',
  imports: [CommonModule, ModalDialog, RubricForm, AppBarBackButton, DialogViewSubmissions, BottomsheetDialog, EssayImages],
  templateUrl: './student-submission-pages.html',
  styleUrl: './student-submission-pages.css',
})
export class StudentSubmissionPages {

  showDialog = false;
  openSheetSubmission = false;
  @Output() closed = new EventEmitter<void>();
  isUploadedFile = true;
  device = inject(DeviceService);
  activeTab = 'uploaded-file';

  feedbacks = [
    {
      "category": "Grammar & Mechanics",
      "score": 4,
      "maxScore": 5,
      "description": "Good overall grammar with minor punctuation errors. Sentence structure is generally correct."
    },
    {
      "category": "Structure & Organization",
      "score": 4,
      "maxScore": 5,
      "description": "Good overall grammar with minor punctuation errors. Sentence structure is generally correct."
    },
    {
      "category": "Content Relevance",
      "score": 4,
      "maxScore": 5,
      "description": "Good overall grammar with minor punctuation errors. Sentence structure is generally correct."
    },
    {
      "category": "Overall Rubric Score",
      "score": 4,
      "maxScore": 5,
      "description": "Good overall grammar with minor punctuation errors. Sentence structure is generally correct."
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


  constructor(private router: Router) { }

  toBack() {
    this.router.navigate(['/teacher/my-classes/detail/student-profile/nana']);
  }

  onEditRubric() {
    this.showDialog = true;
  }

  closeDialog() {
    this.showDialog = false;
  }

  onTabSelected(param: string) {
    this.activeTab = param;
  }

  onCloseSubmission() {
    this.openSheetSubmission = false;
  }
}
