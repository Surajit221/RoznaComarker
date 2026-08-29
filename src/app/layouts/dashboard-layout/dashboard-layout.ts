import { CommonModule, Location } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { DeviceService } from '../../services/device.service';
import { AccountUsage } from '../../components/account-usage/account-usage';
import { AuthService } from '../../auth/auth.service';
import { RoleService } from '../../services/role.service';
import { SubscriptionApiService, type BackendMySubscription } from '../../api/subscription-api.service';
import { environment } from '../../../environments/environment';
import { NotificationApiService, type BackendNotification } from '../../api/notification-api.service';
import { NotificationRealtimeService } from '../../services/notification-realtime.service';
import { trustedStripePortalUrl } from '../../utils/trusted-navigation.util';
import { CreditsApiService, type AssessmentCreditWallet, type CreditPack } from '../../api/credits-api.service';

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

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule, AccountUsage],
  templateUrl: './dashboard-layout.html',
  styleUrls: ['./dashboard-layout.css'],
})
export class DashboardLayout {
  role: string | null = null;
  isUserDropdownOpen = signal(false);
  isNotificationsDropdownOpen = false;

  unreadCount = 0;

  get unreadCountLabel(): string {
    return this.unreadCount > 99 ? '99+' : String(this.unreadCount);
  }

  meName: string = '';
  mePhotoUrl: string = '';

  get avatarUrl(): string {
    const url = this.mePhotoUrl;
    if (!url) return 'img/default-img.png';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${environment.backendUrl}${url}`;
  }

  showAppBar    = signal(false);
  showBottomNav  = signal(true);
  isFullScreen   = signal(false);

  device = inject(DeviceService);
  private auth = inject(AuthService);
  private subscriptionApi = inject(SubscriptionApiService);
  private creditsApi = inject(CreditsApiService);
  roleService = inject(RoleService);

  mySubscription: BackendMySubscription | null = null;
  creditWallet: AssessmentCreditWallet | null = null;
  creditPacks: CreditPack[] = [];
  showTopupDialog = false;
  topupLoading = false;
  topupCheckoutCode: string | null = null;
  topupMessage: string | null = null;
  isSubscriptionLoading = false;
  isCreditsLoading = false;
  subscriptionLoadFailed = false;
  creditsLoadFailed = false;

  teacherMenu = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/teacher/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/teacher/my-classes' },
    { name: 'Reports', icon: 'bx bxs-report', path: '/teacher/reports' },
  ];

  get hasStripeSubscription(): boolean {
    return ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(this.mySubscription?.billing?.status || '');
  }

  get planButtonLabel(): string {
    if (this.mySubscription?.billing?.paymentIssue) return 'Manage Billing';
    return this.hasStripeSubscription ? 'Manage Plan' : 'Upgrade Plan';
  }

  async onPlanButton(): Promise<void> {
    if (this.role !== 'teacher') return;
    if (this.hasStripeSubscription) {
      try {
        const portal = await this.subscriptionApi.createCustomerPortal();
        const portalUrl = trustedStripePortalUrl(portal.url);
        if (portalUrl) {
          window.location.assign(portalUrl);
          return;
        }
      } catch { /* pricing page provides a recoverable fallback */ }
    }
    await this.router.navigate(['/pricing']);
  }

  async onAddCredits(): Promise<void> {
    if (this.topupLoading) return;
    this.showTopupDialog = true;
    this.topupMessage = null;
    if (this.creditPacks.length) return;
    this.topupLoading = true;
    try { this.creditPacks = await this.creditsApi.getPacks(); }
    catch { this.topupMessage = "We couldn't load credit packs. Please try again."; }
    finally { this.topupLoading = false; }
  }

  closeTopupDialog(): void { if (!this.topupCheckoutCode) this.showTopupDialog = false; }

  async purchaseCredits(pack: CreditPack): Promise<void> {
    if (this.topupCheckoutCode) return;
    this.topupCheckoutCode = pack.code;
    this.topupMessage = null;
    try {
      const checkout = await this.creditsApi.createTopupCheckout(pack.code);
      const url = new URL(checkout.url);
      if (url.protocol !== 'https:' || !['checkout.stripe.com', 'buy.stripe.com'].includes(url.hostname)) throw new Error('Untrusted checkout URL');
      window.location.assign(url.toString());
    } catch (error: any) {
      this.topupMessage = error?.error?.message === "This credit pack isn't available for your current plan."
        ? error.error.message : "We couldn't start the payment. Please try again.";
      this.topupCheckoutCode = null;
    }
  }

  async dismissCreditWarning(): Promise<void> {
    try { this.creditWallet = await this.creditsApi.acknowledgeNudge(); }
    catch { /* keep the warning visible if acknowledgement was not persisted */ }
  }

  teacherMenuMobile = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/teacher/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/teacher/my-classes' },
    { name: 'Reports', icon: 'bx bxs-report', path: '/teacher/reports' },
    { name: 'Profile', icon: 'bx bxs-user', path: '/teacher/my-profile' },
  ];

  studentMenu = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/student/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/student/my-classes' },
    { name: 'Report', icon: 'bx bxs-report', path: '/student/reports' },
  ];

  studentMenuMobile = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/student/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/student/my-classes' },
    { name: 'Notification', icon: 'bx bxs-bell', path: '/student/my-notification' },
    { name: 'Profile', icon: 'bx bxs-user', path: '/student/my-profile' },
  ];

  // Array Menu Aktif
  mainMenu: any[] = [];
  mainMenuMobile: any[] = [];

  notifications: BackendNotification[] = [];

  private notificationApi = inject(NotificationApiService);
  private notificationRealtime = inject(NotificationRealtimeService);
  private realtimeEventSub: any;

  constructor(private router: Router, private location: Location) {
    // A. Logic Deteksi Detail Page (AppBar vs BottomNav)
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const url = event.urlAfterRedirects;

        if (url.includes('/detail')) {
          this.showAppBar.set(true);
          this.showBottomNav.set(false);
        } else {
          this.showAppBar.set(false);
          this.showBottomNav.set(true);
        }

        let route = this.router.routerState.snapshot.root;
        while (route.firstChild) route = route.firstChild;
        this.isFullScreen.set(!!route.data['fullScreen']);
      }
    });

  }

  async ngOnInit() {
    const token = localStorage.getItem('backend_jwt');
    if (!token) {
      this.isSubscriptionLoading = false;
      return;
    }
    const payload = token ? decodeJwtPayload(token) : null;
    this.role = (payload && payload.role) || null;

    this.mainMenu = this.role === 'student' ? this.studentMenu : this.teacherMenu;
    this.mainMenuMobile = this.role === 'student' ? this.studentMenuMobile : this.teacherMenuMobile;

    const subscriptionRequest =
      this.role === 'teacher'
        ? this.subscriptionApi.getMySubscription()
        : Promise.resolve(null);
    const creditRequest = this.role === 'teacher' ? this.creditsApi.getWallet() : Promise.resolve(null);

    this.isSubscriptionLoading = this.role === 'teacher';
    this.isCreditsLoading = this.role === 'teacher';
    const [meResult, subResult, creditResult, , ] = await Promise.allSettled([
      this.auth.getMeProfile(),
      subscriptionRequest,
      creditRequest,
      this.refreshNotificationsPreview(),
      this.refreshUnreadCount(),
    ]);
    this.isSubscriptionLoading = false;
    this.isCreditsLoading = false;

    if (meResult.status === 'fulfilled') {
      const me = meResult.value;
      this.meName = me.displayName || me.email || '';
      this.mePhotoUrl = me.photoURL || '';
    }

    if (subResult.status === 'fulfilled' && subResult.value) {
      this.mySubscription = subResult.value;
      this.subscriptionLoadFailed = false;
    } else {
      this.mySubscription = null;
      this.subscriptionLoadFailed = this.role === 'teacher';
    }
    this.creditWallet = creditResult.status === 'fulfilled' ? creditResult.value : null;
    this.creditsLoadFailed = this.role === 'teacher' && creditResult.status !== 'fulfilled';

    const topupState = this.router.routerState.snapshot.root.queryParamMap.get('topup');
    if (topupState === 'confirming') void this.confirmTopupPayment();
    else if (topupState === 'cancelled') this.topupMessage = 'Payment was cancelled. No credits were added.';

    this.notificationRealtime.connect();
    this.notificationRealtime.notifications$.subscribe((n) => {
      this.notifications = [n, ...(this.notifications || [])].slice(0, 5);
      if (!n?.readAt) {
        this.unreadCount = Math.max(0, Number(this.unreadCount) + 1);
      }
    });
    this.realtimeEventSub = this.notificationRealtime.events$.subscribe((event) => {
      if (this.role === 'teacher' && event?.type === 'credits_updated') {
        void this.refreshAuthoritativeCredits();
      }
    });
  }

  ngOnDestroy() {
    this.realtimeEventSub?.unsubscribe?.();
    this.notificationRealtime.disconnect();
  }

  private async refreshAuthoritativeCredits(): Promise<void> {
    try {
      this.creditWallet = await this.creditsApi.getWallet();
      this.creditsLoadFailed = false;
    } catch {
      // Preserve the last known server value if a transient refresh fails.
    }
  }

  async retryAccountUsage(): Promise<void> {
    if (this.role !== 'teacher' || this.isSubscriptionLoading || this.isCreditsLoading) return;
    this.isSubscriptionLoading = true;
    this.isCreditsLoading = true;
    const [subscriptionResult, creditResult] = await Promise.allSettled([
      this.subscriptionApi.getMySubscription(), this.creditsApi.getWallet()
    ]);
    this.isSubscriptionLoading = false;
    this.isCreditsLoading = false;
    if (subscriptionResult.status === 'fulfilled') {
      this.mySubscription = subscriptionResult.value;
      this.subscriptionLoadFailed = false;
    } else this.subscriptionLoadFailed = true;
    if (creditResult.status === 'fulfilled') {
      this.creditWallet = creditResult.value;
      this.creditsLoadFailed = false;
    } else this.creditsLoadFailed = true;
  }

  private async confirmTopupPayment(): Promise<void> {
    this.showTopupDialog = true;
    this.topupMessage = 'Payment received. Credits are being added.';
    const before = this.creditWallet?.availableCredits;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1500));
      await this.refreshAuthoritativeCredits();
      if (typeof before === 'number' && Number(this.creditWallet?.availableCredits) > before) {
        this.topupMessage = `Credits added. ${this.creditWallet?.availableCredits} Assessment Credits are now available.`;
        return;
      }
    }
  }

  // Helper navigasi
  goBack() {
    this.location.back();
  }

  // Dropdown Logic
  toggleUserDropdown() {
    this.isUserDropdownOpen.update((v) => !v);
    this.isNotificationsDropdownOpen = false;
  }

  toggleNotificationsDropdown() {
    const next = !this.isNotificationsDropdownOpen;
    this.isNotificationsDropdownOpen = next;
    this.isUserDropdownOpen.set(false);

    if (next) {
      this.refreshNotificationsPreview();
      this.refreshUnreadCount();
    }
  }

  private async refreshNotificationsPreview() {
    try {
      this.notifications = await this.notificationApi.listMyNotifications(5);
    } catch {
      this.notifications = [];
    }
  }

  private async refreshUnreadCount() {
    try {
      this.unreadCount = await this.notificationApi.getUnreadCount();
    } catch {
      this.unreadCount = 0;
    }
  }

  iconFor(n: BackendNotification): { icon: string; iconBg: string; iconColor: string } {
    if (n?.type === 'assignment_submitted') {
      return { icon: 'bxs-check-circle', iconBg: 'bg-[#B0F8D5]', iconColor: 'text-[#136C6D]' };
    }
    if (n?.type === 'assignment_uploaded') {
      return { icon: 'bxs-book', iconBg: 'bg-[#D7DBFF]', iconColor: 'text-[#2F2F9F]' };
    }
    if (n?.type === 'assignment_removed') {
      return { icon: 'bxs-trash', iconBg: 'bg-[#FFE3E3]', iconColor: 'text-[#B42318]' };
    }
    return { icon: 'bxs-bell', iconBg: 'bg-[#F3F3F3]', iconColor: 'text-[#474747]' };
  }

  timeFor(n: BackendNotification): string {
    const raw = (n as any)?.createdAt;
    const d = raw ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  async onClickNavbarNotification(n: BackendNotification) {
    const route: any = n?.data?.route;
    if (!route || typeof route.path !== 'string') return;

    try {
      if (n?._id && !n.readAt) {
        await this.notificationApi.markRead(n._id);
        this.unreadCount = Math.max(0, Number(this.unreadCount) - 1);
      }
    } catch {
      // ignore
    }

    const commands: any[] = [route.path, ...(Array.isArray(route.params) ? route.params : [])];
    this.closeAllDropdowns();
    this.router.navigate(commands, {
      queryParams: route.queryParams || undefined
    });
  }

  async onMarkNavbarNotificationRead(event: Event, n: BackendNotification) {
    event.stopPropagation();
    if (!n?._id || n.readAt) return;

    const now = new Date().toISOString();
    this.notifications = (this.notifications || []).map((x) => (x._id === n._id ? { ...x, readAt: now } : x));
    this.unreadCount = Math.max(0, Number(this.unreadCount) - 1);

    try {
      await this.notificationApi.markRead(n._id);
    } catch {
      await this.refreshNotificationsPreview();
      await this.refreshUnreadCount();
    }
  }

  async onMarkAllNavbarNotificationsRead(event: Event) {
    event.stopPropagation();
    if (!this.unreadCount) return;

    const now = new Date().toISOString();
    this.notifications = (this.notifications || []).map((x) => ({ ...x, readAt: x.readAt || now }));
    this.unreadCount = 0;

    try {
      await this.notificationApi.markAllRead();
    } catch {
      await this.refreshNotificationsPreview();
      await this.refreshUnreadCount();
    }
  }

  toAllNotifications() {
    const role = this.roleService.currentRole();
    this.closeAllDropdowns();
    this.router.navigate(['/', role, 'my-notification']);
  }

  closeAllDropdowns() {
    this.isUserDropdownOpen.set(false);
    this.isNotificationsDropdownOpen = false;
  }

  // Close dropdown when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('#user-menu') && !target.closest('#notif-menu')) {
      this.closeAllDropdowns();
    }
  }

  async toLogin() {
    await this.auth.logout();
    localStorage.removeItem('role');
    this.router.navigate(['/login']);
  }
}
