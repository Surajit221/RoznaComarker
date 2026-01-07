import { Routes } from '@angular/router';
import { LandingPageLayout } from '../../layouts/landing-page-layout/landing-page-layout';
import { LandingPage } from './landing-page';
import { TncPpLayout } from '../../layouts/tnc-pp-layout/tnc-pp-layout';
import { TncPage } from './tnc-page/tnc-page';
import { PpPage } from './pp-page/pp-page';
export const LANDINGPAGE_ROUTE: Routes = [
  {
    path: '',
    component: LandingPageLayout,
    children: [{ path: '', component: LandingPage }],
  },

  {
    path: '',
    component: TncPpLayout,
    children: [
      { path: 'term-and-condition', component: TncPage },
      { path: 'privacy-policy', component: PpPage }
    ],
  },
];
