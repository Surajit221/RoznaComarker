import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, HostListener, Inject, OnDestroy, ViewChild, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';

export interface AdminNavItem {
  label: string;
  description: string;
  icon: string;
  route: string;
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    label: 'Teacher Credits',
    description: 'Review balances and audited adjustments.',
    icon: 'bx bxs-wallet',
    route: '/admin/credits',
  },
  {
    label: 'Pricing Configuration',
    description: 'Manage plans, packs, and usage thresholds.',
    icon: 'bx bxs-purchase-tag',
    route: '/admin/pricing',
  },
  { label: 'Retention Settings', description: 'Manage rewards, milestones, digests, and institution defaults.', icon: 'bx bxs-cog', route: '/admin/retention' },
  { label: 'Retention Operations', description: 'Review referrals, rewards, milestones, and institutions.', icon: 'bx bxs-report', route: '/admin/retention-operations' },
];

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout implements OnDestroy {
  @ViewChild('drawer') private drawer?: ElementRef<HTMLElement>;
  @ViewChild('menuButton') private menuButton?: ElementRef<HTMLButtonElement>;

  readonly navItems = ADMIN_NAV_ITEMS;
  readonly drawerOpen = signal(false);
  readonly currentUrl = signal('');
  private readonly routerEvents: Subscription;
  private previousBodyOverflow = '';

  constructor(private readonly router: Router, @Inject(DOCUMENT) private readonly document: Document) {
    this.currentUrl.set(this.router.url);
    this.routerEvents = this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
        this.closeDrawer(false);
      });
  }

  get currentItem(): AdminNavItem {
    return this.navItems.find((item) => this.currentUrl().startsWith(item.route)) || this.navItems[0];
  }

  openDrawer(): void {
    if (this.drawerOpen()) return;
    this.previousBodyOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';
    this.drawerOpen.set(true);
    setTimeout(() => this.drawer?.nativeElement.focus());
  }

  closeDrawer(restoreFocus = true): void {
    if (!this.drawerOpen()) return;
    this.drawerOpen.set(false);
    this.document.body.style.overflow = this.previousBodyOverflow;
    if (restoreFocus) setTimeout(() => this.menuButton?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDrawer();
  }

  ngOnDestroy(): void {
    this.routerEvents.unsubscribe();
    if (this.drawerOpen()) this.document.body.style.overflow = this.previousBodyOverflow;
  }
}
