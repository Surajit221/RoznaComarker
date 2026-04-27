import { Routes } from '@angular/router';
import { DashboardLayout } from '../../layouts/dashboard-layout/dashboard-layout';
import { TeacherGuard } from '../../auth/teacher.guard';
import { AuthGuard } from '../../auth/auth.guard';
import { FlashcardLibrary } from './flashcard-library/flashcard-library';
import { CreateFlashcard } from './create-flashcard/create-flashcard';
import { FlashcardEditor } from './flashcard-editor/flashcard-editor';
import { FlashcardDetail } from './flashcard-detail/flashcard-detail';
import { StudyMode } from './study-mode/study-mode';
import { StudyResults } from './study-results/study-results';
import { FlashcardReport } from './flashcard-report/flashcard-report';

export const FLASHCARD_ROUTES: Routes = [
  {
    path: '',
    component: DashboardLayout,
    children: [
      { path: '', component: FlashcardLibrary, canActivate: [TeacherGuard] },
      { path: 'create', component: CreateFlashcard, canActivate: [TeacherGuard] },
      { path: ':id/edit', component: FlashcardEditor, canActivate: [TeacherGuard] },
      { path: ':id/study/results', component: StudyResults, canActivate: [AuthGuard], data: { fullScreen: true } },
      { path: ':id/study', component: StudyMode, canActivate: [AuthGuard], data: { fullScreen: true } },
      { path: ':id/report', component: FlashcardReport, canActivate: [TeacherGuard] },
      { path: ':id', component: FlashcardDetail, canActivate: [TeacherGuard] },
    ],
  },
];
