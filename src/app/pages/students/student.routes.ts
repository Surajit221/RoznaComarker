import { Routes } from '@angular/router';
import { DashboardLayout } from '../../layouts/dashboard-layout/dashboard-layout';
import { DashboardStudentPages } from './dashboard-student-pages/dashboard-student-pages';
import { MyClassStudentPages } from './my-class-student-pages/my-class-student-pages';
import { DetailMyClassStudentPages } from './my-class-student-pages/detail-my-class-student-pages/detail-my-class-student-pages';
import { MySubmissionPage } from './my-class-student-pages/detail-my-class-student-pages/my-submission-page/my-submission-page';
import { MyNotificationStudentPages } from './my-notification-student-pages/my-notification-student-pages';
import { MyProfileStudentPages } from './my-profile-student-pages/my-profile-student-pages';
export const STUDENT_ROUTE: Routes = [
  {
    path: 'student',
    component: DashboardLayout,
    children: [
      { path: 'dashboard', component: DashboardStudentPages },
      { path: 'my-notification', component: MyNotificationStudentPages },
      { path: 'my-profile', component: MyProfileStudentPages },
      { path: 'my-classes', component: MyClassStudentPages },
      { path: 'my-classes/detail/:slug', component: DetailMyClassStudentPages },
      { path: 'my-classes/detail/my-submissions/:slug', component: MySubmissionPage },
    ],
  },
];
