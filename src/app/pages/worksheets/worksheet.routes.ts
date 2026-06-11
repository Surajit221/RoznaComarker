import { Routes } from '@angular/router';
import { DashboardLayout } from '../../layouts/dashboard-layout/dashboard-layout';
import { TeacherGuard } from '../../auth/teacher.guard';
import { WorksheetCreatePage } from './worksheet-create/worksheet-create';
import { WorksheetEditPage } from './worksheet-edit/worksheet-edit';
import { WorksheetReport } from './worksheet-report/worksheet-report';
import { WorksheetLibrary } from './worksheet-library/worksheet-library';
import { WorksheetGeneratorComponent } from './worksheet-generator/worksheet-generator';

export const WORKSHEET_ROUTES: Routes = [
  {
    path: '',
    component: DashboardLayout,
    children: [
      { path: '', component: WorksheetLibrary, canActivate: [TeacherGuard] },
      { path: 'create', component: WorksheetCreatePage, canActivate: [TeacherGuard] },
      { path: 'generate', component: WorksheetGeneratorComponent, canActivate: [TeacherGuard] },
      { path: ':id/edit', component: WorksheetEditPage, canActivate: [TeacherGuard] },
      { path: ':id/report', component: WorksheetReport, canActivate: [TeacherGuard] },
    ],
  },
];
