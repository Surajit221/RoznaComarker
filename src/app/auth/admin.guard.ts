import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { decodeBackendJwt, readUsableBackendJwt } from './backend-token.util';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(private readonly router: Router) {}
  canActivate(_route: unknown, state: RouterStateSnapshot): boolean | UrlTree {
    const token = readUsableBackendJwt();
    if (!token) return this.router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
    return decodeBackendJwt(token)?.role === 'admin' ? true : this.router.createUrlTree(['/']);
  }
}
