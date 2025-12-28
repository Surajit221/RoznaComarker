import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DeviceService } from '../../../../../services/device.service';
import { CommonModule } from '@angular/common';
import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';

@Component({
  selector: 'app-my-submission-page',
  imports: [CommonModule, AppBarBackButton],
  templateUrl: './my-submission-page.html',
  styleUrl: './my-submission-page.css',
})
export class MySubmissionPage {
  isUploadedFile = false;
  device = inject(DeviceService);
  activeTab = 'uploaded-file';

  feedbacks = [
    {
      category: 'Grammar & Mechanics',
      score: 4,
      maxScore: 5,
      description:
        'Good overall grammar with minor punctuation errors. Sentence structure is generally correct.',
    },
    {
      category: 'Structure & Organization',
      score: 4,
      maxScore: 5,
      description:
        'Good overall grammar with minor punctuation errors. Sentence structure is generally correct.',
    },
    {
      category: 'Content Relevance',
      score: 4,
      maxScore: 5,
      description:
        'Good overall grammar with minor punctuation errors. Sentence structure is generally correct.',
    },
    {
      category: 'Overall Rubric Score',
      score: 4,
      maxScore: 5,
      description:
        'Good overall grammar with minor punctuation errors. Sentence structure is generally correct.',
    },
  ];

  constructor(private router: Router) {}

  toBack() {
    this.router.navigate(['/student/my-classes/detail/creative-essay-practice']);
  }

  onTabSelected(param: string) {
    this.activeTab = param;
  }
}
