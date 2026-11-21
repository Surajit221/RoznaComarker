import { Routes } from '@angular/router';
import { DashboardLayout } from '../../layouts/dashboard-layout/dashboard-layout';
import { DashboardStudentPages } from './dashboard-student-pages/dashboard-student-pages';
import { MyClassStudentPages } from './my-class-student-pages/my-class-student-pages';
import { DetailMyClassStudentPages } from './my-class-student-pages/detail-my-class-student-pages/detail-my-class-student-pages';
import { MySubmissionPage } from './my-class-student-pages/detail-my-class-student-pages/my-submission-page/my-submission-page';
import { MyNotificationStudentPages } from './my-notification-student-pages/my-notification-student-pages';
import { MyProfileStudentPages } from './my-profile-student-pages/my-profile-student-pages';
import { HandwrittenOcrPage } from './handwritten-ocr-page/handwritten-ocr-page';
import { JoinClassLinkPages } from './join-class-link-pages/join-class-link-pages';
import { StudentGuard } from '../../auth/student.guard';
/* Issue 3 — student learning tool routes */
import { StudentFlashcardPlayer } from './student-flashcard-player/student-flashcard-player';
import { StudentWorksheetViewer } from './student-worksheet-viewer/student-worksheet-viewer';
import { StudentResultsPage } from './student-results-page/student-results-page';
import { StudentWorksheetResultsPage } from './student-worksheet-results/student-worksheet-results';
import { StudentWorksheetPageComponent } from './student-worksheet-page/student-worksheet-page';
import { AssignmentQrRedirect } from './assignment-qr-redirect/assignment-qr-redirect';
import { StudentSpeakingSubmissionPage } from './my-class-student-pages/detail-my-class-student-pages/speaking-submission-page/speaking-submission-page';
import { unsavedWorkGuard } from '../../core/app-update/unsaved-work';

export const STUDENT_ROUTE: Routes = [
  {
    path: 'student',
    component: DashboardLayout,
    canActivate: [StudentGuard],
    children: [
      { path: 'dashboard', component: DashboardStudentPages },
      { path: 'my-notification', component: MyNotificationStudentPages },
      { path: 'my-profile', component: MyProfileStudentPages },
      { path: 'my-classes', component: MyClassStudentPages },
      // The unsaved-work guard keeps a recording upload in progress from being lost to a navigation (stage 7d).
      { path: 'my-classes/detail/:slug', component: DetailMyClassStudentPages, canDeactivate: [unsavedWorkGuard] },
      { path: 'my-classes/detail/my-submissions/:slug', component: MySubmissionPage },
      { path: 'my-classes/detail/my-speaking/:assignmentId', component: StudentSpeakingSubmissionPage, canDeactivate: [unsavedWorkGuard] },
      { path: 'join-class', component: JoinClassLinkPages },
      { path: 'classroom/:classId', component: DetailMyClassStudentPages, canDeactivate: [unsavedWorkGuard] },
      { path: 'handwritten-ocr', component: HandwrittenOcrPage },
      { path: 'assignments/qr/:qrToken', component: AssignmentQrRedirect },
      /* ── Learning tool routes (Issue 3) ─────────────────── */
      { path: 'flashcard-player/:flashcardSetId', component: StudentFlashcardPlayer },
      { path: 'worksheet-viewer/:worksheetId',    component: StudentWorksheetViewer },
      { path: 'worksheet/:worksheetId',           component: StudentWorksheetPageComponent },
      { path: 'results',                          component: StudentResultsPage },
      { path: 'worksheet-results',                component: StudentWorksheetResultsPage },
    ],
  },
];
