import { Routes } from '@angular/router';
import { AuthLayout } from '../../layouts/auth-layout/auth-layout';
import { LoginPages } from './login-pages/login-pages';
import { RegisterPages } from './register-pages/register-pages';
export const AUTH_ROUTES: Routes = [
  {
    path: '',
    component: AuthLayout,
    children: [
      { path: 'login', component: LoginPages },
      { path: 'register', component: RegisterPages },
    ],
  },
];
