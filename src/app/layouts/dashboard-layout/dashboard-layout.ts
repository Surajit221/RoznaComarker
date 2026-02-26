import { CommonModule, Location } from '@angular/common';
import { Component, effect, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { DeviceService } from '../../services/device.service';
import { ChartStorage } from '../../shared/chart-storage/chart-storage';
import { AuthService } from '../../auth/auth.service';
import { RoleService } from '../../services/role.service';
import { SubscriptionApiService, type BackendMySubscription } from '../../api/subscription-api.service';
import { environment } from '../../../environments/environment';

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
  imports: [CommonModule, RouterOutlet, RouterModule, ChartStorage],
  templateUrl: './dashboard-layout.html',
  styleUrls: ['./dashboard-layout.css'],
})
export class DashboardLayout {
  role: string | null = null;
  isUserDropdownOpen = signal(false);
  isNotificationsDropdownOpen = false;

  meName: string = '';
  mePhotoUrl: string = '';

  get avatarUrl(): string {
    const url = this.mePhotoUrl;
    if (!url) return 'img/default-img.png';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${environment.apiUrl}${url}`;
  }

  showAppBar = signal(false);
  showBottomNav = signal(true);

  device = inject(DeviceService);
  private auth = inject(AuthService);
  private subscriptionApi = inject(SubscriptionApiService);
  roleService = inject(RoleService);

  mySubscription: BackendMySubscription | null = null;
  isSubscriptionLoading = false;

  teacherMenu = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/teacher/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/teacher/my-classes' },
    { name: 'Reports', icon: 'bx bxs-report', path: '/teacher/reports' },
  ];

  get storageUsedGb(): number {
    const usedMB = this.mySubscription?.usage?.storageMB;
    const usedGb = typeof usedMB === 'number' && Number.isFinite(usedMB) ? usedMB / 1024 : 0;
    return Math.max(0, Number(usedGb.toFixed(2)));
  }

  get storageTotalGb(): number {
    const limitMB = this.mySubscription?.plan?.limits?.storageMB;
    const totalGb = typeof limitMB === 'number' && Number.isFinite(limitMB) ? limitMB / 1024 : 0;
    return Math.max(0, Number(totalGb.toFixed(2)));
  }

  teacherMenuMobile = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/teacher/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/teacher/my-classes' },
    { name: 'Notification', icon: 'bx bxs-bell', path: '/teacher/notifications' }, // Sesuaikan path
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
    { name: 'Notification', icon: 'bx bxs-bell', path: '/student/notifications' },
    { name: 'Profile', icon: 'bx bxs-user', path: '/student/my-profile' },
  ];

  // Array Menu Aktif
  mainMenu: any[] = [];
  mainMenuMobile: any[] = [];

  notifications: Array<{
    icon: string;
    iconBg: string;
    iconColor: string;
    title: string;
    description: string;
    time: string;
  }> = [];

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
      }
    });

  }

  async ngOnInit() {
    const token = localStorage.getItem('backend_jwt');
    const payload = token ? decodeJwtPayload(token) : null;
    this.role = (payload && payload.role) || null;

    this.mainMenu = this.role === 'student' ? this.studentMenu : this.teacherMenu;
    this.mainMenuMobile = this.role === 'student' ? this.studentMenuMobile : this.teacherMenuMobile;

    try {
      const me = await this.auth.getMeProfile();
      this.meName = me.displayName || me.email || '';
      this.mePhotoUrl = me.photoURL || '';
    } catch {
      this.meName = '';
      this.mePhotoUrl = '';
    }

    this.isSubscriptionLoading = true;
    try {
      this.mySubscription = await this.subscriptionApi.getMySubscription();
    } catch {
      this.mySubscription = null;
    } finally {
      this.isSubscriptionLoading = false;
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
    this.isNotificationsDropdownOpen = !this.isNotificationsDropdownOpen;
    this.isUserDropdownOpen.set(false);
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
