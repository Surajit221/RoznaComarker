import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
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
