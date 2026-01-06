import { Routes } from '@angular/router';
import { LandingPageLayout } from '../../layouts/landing-page-layout/landing-page-layout';
import { LandingPage } from './landing-page';
export const LANDINGPAGE_ROUTE: Routes = [
  {
    path: '',
    component: LandingPageLayout,
    children: [{ path: '', component: LandingPage }],
  },
];
