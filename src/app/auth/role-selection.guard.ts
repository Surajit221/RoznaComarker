import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { PostAuthNavigationService } from './post-auth-navigation.service';
import { isQrJoinUrl } from './safe-return-url';

@Injectable({ providedIn: 'root' })
export class RoleSelectionGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router,
    private postAuth: PostAuthNavigationService) {}

  canActivate(_route?: unknown, state?: RouterStateSnapshot): boolean | UrlTree | Promise<boolean | UrlTree> {
    const returnUrl = state ? this.router.parseUrl(state.url).queryParams['returnUrl'] : null;
    if (isQrJoinUrl(returnUrl)) return this.qrRoleSelection(returnUrl);
    if (!this.auth.getBackendJwt()) return this.router.createUrlTree(['/login']);
    const role = this.auth.getBackendRole();
    if (this.postAuth.isFinalizedRole(role)) {
      return this.router.parseUrl(this.postAuth.defaultDestination(role));
    }
    return true;
  }

  private async qrRoleSelection(returnUrl: string): Promise<boolean | UrlTree> {
    try {
      const session = await this.auth.ensureQrBackendSession();
      if (session.state !== 'ready') return this.router.createUrlTree([
        session.state === 'verification' ? '/verify-email' : '/login'
      ], { queryParams: { returnUrl } });
      if (session.role === 'student') return this.router.parseUrl(returnUrl);
      if (this.postAuth.isFinalizedRole(session.role)) return this.router.parseUrl(this.postAuth.defaultDestination(session.role));
      return true;
    } catch { return this.router.createUrlTree(['/login'], { queryParams: { returnUrl } }); }
  }
}
