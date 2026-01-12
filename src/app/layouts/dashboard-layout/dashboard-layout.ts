import { CommonModule, Location } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { DeviceService } from '../../services/device.service';
import { ChartStorage } from '../../shared/chart-storage/chart-storage';
import { AuthService } from '../../auth/auth.service';

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

  showAppBar = signal(false);
  showBottomNav = signal(true);

  device = inject(DeviceService);
  private auth = inject(AuthService);

  teacherMenu = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/teacher/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/teacher/my-classes' },
    { name: 'Reports', icon: 'bx bxs-report', path: '/teacher/reports' },
  ];

  teacherMenuMobile = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/teacher/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/teacher/my-classes' },
    { name: 'Notification', icon: 'bx bxs-bell', path: '/teacher/my-notification' },
    { name: 'Profile', icon: 'bx bxs-user', path: '/teacher/my-profile' },
  ];

  studentMenu = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/student/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/student/my-classes' },
    { name: 'Report', icon: 'bx bxs-report', path: '/student/my-report' },
  ];

  studentMenuMobile = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/student/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/student/my-classes' },
    { name: 'Notification', icon: 'bx bxs-bell', path: '/student/my-notification' },
    { name: 'Profile', icon: 'bx bxs-user', path: '/student/my-profile' },
  ];

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
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const url = event.urlAfterRedirects;

        if (url.includes('/detail')) {
          // Jika URL mengandung /detail
          this.showAppBar.set(true);
          this.showBottomNav.set(false);
        } else {
          // Halaman utama
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
    } catch {
      this.meName = '';
    }
  }

  goBack() {
    this.location.back();
  }

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
