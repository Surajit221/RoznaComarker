import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class TeacherGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(): boolean | UrlTree {
    const token = localStorage.getItem('backend_jwt');
    if (!token) return this.router.parseUrl('/login');

    const payload = decodeJwtPayload(token);
    const role = payload && payload.role;

    if (role !== 'teacher') {
      return this.router.parseUrl('/login');
    }

    return true;
  }
}
