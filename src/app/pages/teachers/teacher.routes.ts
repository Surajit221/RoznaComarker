import { Routes } from '@angular/router';
import { DashboardLayout } from '../../layouts/dashboard-layout/dashboard-layout';
import { DashboardTeacherPages } from './dashboard-teacher-pages/dashboard-teacher-pages';
import { MyClassesPages } from './my-classes-pages/my-classes-pages';
import { DetailMyClassesPages } from './my-classes-pages/detail-my-classes-pages/detail-my-classes-pages';
import { StudentProfilePages } from './my-classes-pages/detail-my-classes-pages/student-profile-pages/student-profile-pages';
import { StudentSubmissionPages } from './my-classes-pages/detail-my-classes-pages/student-submission-pages/student-submission-pages';
import { MyNotificationPages } from './my-notification-pages/my-notification-pages';
import { MyProfilePages } from './my-profile-pages/my-profile-pages';
import { ReportPages } from './report-pages/report-pages';
export const TEACHER_ROUTE: Routes = [
  {
    path: 'teacher',
    component: DashboardLayout,
    children: [
      { path: 'dashboard', component: DashboardTeacherPages },
      { path: 'my-classes', component: MyClassesPages },
      { path: 'my-notification', component: MyNotificationPages },
      { path: 'my-profile', component: MyProfilePages },
      { path: 'reports', component: ReportPages },
      { path: 'my-classes/detail/:slug', component: DetailMyClassesPages },
      { path: 'my-classes/detail/student-profile/nana', component: StudentProfilePages },
      { path: 'my-classes/detail/student-submissions/nana', component: StudentSubmissionPages },
    ],
  },
];
