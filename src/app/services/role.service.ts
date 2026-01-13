import { Injectable, signal, WritableSignal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

export type AppRole = 'teacher' | 'student' | null;

@Injectable({
  providedIn: 'root',
})
export class RoleService {
  currentRole: WritableSignal<AppRole> = signal(null);

  constructor(private router: Router) {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.detectRole(event.urlAfterRedirects || event.url);
      });
  }

  private detectRole(url: string) {
    const segments = url.split('/');
    const firstSegment = segments[1];
    if (firstSegment === 'teacher' || firstSegment === 'student') {
      if (this.currentRole() !== firstSegment) {
        this.currentRole.set(firstSegment as AppRole);
      }
    }
  }
}
