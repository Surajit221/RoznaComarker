import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { PostAuthNavigationService } from './post-auth-navigation.service';

@Injectable({ providedIn: 'root' })
export class RoleSelectionGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router,
    private postAuth: PostAuthNavigationService) {}

  canActivate(): boolean | UrlTree {
    if (!this.auth.getBackendJwt()) return this.router.createUrlTree(['/login']);
    const role = this.auth.getBackendRole();
    if (this.postAuth.isFinalizedRole(role)) {
      return this.router.parseUrl(this.postAuth.defaultDestination(role));
    }
    return true;
  }
}
