import { Routes } from '@angular/router';
import { TeacherGuard } from './auth/teacher.guard';
import { AdminGuard } from './auth/admin.guard';
import { AdminLayout } from './layouts/admin-layout/admin-layout';

export const routes: Routes = [
  { path: 'institution/invites/:token', canActivate: [TeacherGuard], loadComponent: () =>
    import('./pages/teachers/institution/institution-invite').then((m) => m.InstitutionInvitePage) },
  {
    path: 'admin',
    canActivate: [AdminGuard],
    component: AdminLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'credits' },
      { path: 'credits', loadComponent: () => import('./pages/admin/admin-credits').then((m) => m.AdminCredits) },
      { path: 'pricing', loadComponent: () => import('./pages/admin/admin-pricing').then((m) => m.AdminPricing) },
      { path: 'retention', loadComponent: () => import('./pages/admin/admin-retention').then((m) => m.AdminRetention) },
      { path: 'retention-operations', loadComponent: () => import('./pages/admin/admin-retention-operations').then((m) => m.AdminRetentionOperations) },
    ],
  },
  {
    path: 'checkout/starter',
    canActivate: [TeacherGuard],
    loadComponent: () => import('./pages/checkout/checkout').then((m) => m.CheckoutComponent),
  },
  {
    path: 'checkout/success',
    canActivate: [TeacherGuard],
    loadComponent: () => import('./pages/checkout/checkout-success').then((m) => m.CheckoutSuccessComponent),
  },
  {
    path: 'checkout/cancel',
    canActivate: [TeacherGuard],
    loadComponent: () => import('./pages/checkout/checkout-cancel').then((m) => m.CheckoutCancelComponent),
  },
  { path: 'billing/paypal/success', canActivate: [TeacherGuard], loadComponent: () =>
    import('./pages/checkout/checkout-success').then((m) => m.CheckoutSuccessComponent) },
  { path: 'billing/paypal/cancel', canActivate: [TeacherGuard], loadComponent: () =>
    import('./pages/checkout/checkout-cancel').then((m) => m.CheckoutCancelComponent) },
  { path: 'billing/paypal/manage', canActivate: [TeacherGuard], loadComponent: () =>
    import('./pages/paypal-manage/paypal-manage').then((m) => m.PayPalManageComponent) },
  { path: 'billing/paypal/change-plan/success', canActivate: [TeacherGuard], data: { paypalChangeResult: 'success' }, loadComponent: () =>
    import('./pages/paypal-manage/paypal-manage').then((m) => m.PayPalManageComponent) },
  { path: 'billing/paypal/change-plan/cancel', canActivate: [TeacherGuard], data: { paypalChangeResult: 'cancel' }, loadComponent: () =>
    import('./pages/paypal-manage/paypal-manage').then((m) => m.PayPalManageComponent) },
  {
    path: 'checkout/:planCode',
    canActivate: [TeacherGuard],
    loadComponent: () => import('./pages/checkout/checkout').then((m) => m.CheckoutComponent),
  },
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
