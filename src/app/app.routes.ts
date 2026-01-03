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
    path: '**',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];
