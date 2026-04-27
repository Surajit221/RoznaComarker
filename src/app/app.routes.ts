import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '',
    pathMatch: 'full',
  },
  {
    path: '',
    loadChildren: () =>
      import('./pages/landing-page/landing-page.route').then((m) => m.LANDINGPAGE_ROUTE),
  },

  {
    path: '',
    loadChildren: () => import('./pages/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  {
    path: '',
    loadChildren: () => import('./pages/students/student.routes').then((m) => m.STUDENT_ROUTE),
  },

  {
    path: '',
    loadChildren: () => import('./pages/teachers/teacher.routes').then((m) => m.TEACHER_ROUTE),
  },

  {
    path: 'flashcards',
    loadChildren: () =>
      import('./pages/flashcards/flashcard.routes').then((m) => m.FLASHCARD_ROUTES),
  },

  /** Worksheet creation and management pages (teacher only, guarded in WORKSHEET_ROUTES) */
  {
    path: 'worksheets',
    loadChildren: () =>
      import('./pages/worksheets/worksheet.routes').then((m) => m.WORKSHEET_ROUTES),
  },

  /** Public shared flashcard player (no auth guard) */
  {
    path: 'shared/flashcards/:shareToken',
    loadComponent: () =>
      import('./pages/students/shared-flashcard-player/shared-flashcard-player').then(
        (m) => m.SharedFlashcardPlayer
      ),
  },

  {
    path: '**',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];
