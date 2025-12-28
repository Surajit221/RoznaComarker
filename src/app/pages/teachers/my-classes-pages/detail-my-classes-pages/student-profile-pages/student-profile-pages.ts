import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DeviceService } from '../../../../../services/device.service';
import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';

@Component({
  selector: 'app-student-profile-pages',
  imports: [CommonModule, AppBarBackButton],
  templateUrl: './student-profile-pages.html',
  styleUrl: './student-profile-pages.css',
})
export class StudentProfilePages {
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

  constructor(private router: Router) { }

  toDetailMyClasses() {
    this.router.navigate(['/teacher/my-classes/detail/creative-essay-practice']);
  }

  toStudentEssay() {
    this.router.navigate(['/teacher/my-classes/detail/student-submissions/nana']);
  }

  handleGoBack() {
    this.router.navigate(['/teacher/my-classes']);
  }
}
