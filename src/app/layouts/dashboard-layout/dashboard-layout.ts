import { CommonModule, Location } from '@angular/common';
import { Component, effect, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { DeviceService } from '../../services/device.service';
import { ChartStorage } from '../../shared/chart-storage/chart-storage';
import { RoleService } from '../../services/role.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule, ChartStorage],
  templateUrl: './dashboard-layout.html',
  styleUrls: ['./dashboard-layout.css'],
})
export class DashboardLayout {
  // 1. Inject Role Service & Device Service
  roleService = inject(RoleService);
  device = inject(DeviceService);

  // 2. State Dropdown & UI
  isUserDropdownOpen = signal(false);
  isNotificationsDropdownOpen = false;
  showAppBar = signal(false);
  showBottomNav = signal(true);

  // 3. Definisi Menu (Hardcoded Paths sudah sesuai dengan deteksi URL)
  teacherMenu = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/teacher/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/teacher/my-classes' },
    { name: 'Reports', icon: 'bx bxs-report', path: '/teacher/reports' },
    // Tambahkan menu shared jika perlu
    { name: 'Profile', icon: 'bx bxs-user', path: '/teacher/profile' },
  ];

  teacherMenuMobile = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/teacher/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/teacher/my-classes' },
    { name: 'Notification', icon: 'bx bxs-bell', path: '/teacher/notifications' }, // Sesuaikan path
    { name: 'Profile', icon: 'bx bxs-user', path: '/teacher/profile' },
  ];

  studentMenu = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/student/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/student/my-classes' },
    { name: 'Report', icon: 'bx bxs-report', path: '/student/reports' }, // Sesuaikan path
    { name: 'Profile', icon: 'bx bxs-user', path: '/student/profile' },
  ];

  studentMenuMobile = [
    { name: 'Dashboard', icon: 'bx bxs-widget', path: '/student/dashboard' },
    { name: 'My Classes', icon: 'bx bxs-graduation', path: '/student/my-classes' },
    { name: 'Notification', icon: 'bx bxs-bell', path: '/student/notifications' },
    { name: 'Profile', icon: 'bx bxs-user', path: '/student/profile' },
  ];

  // Array Menu Aktif
  mainMenu: any[] = [];
  mainMenuMobile: any[] = [];

  // Data Notifikasi Dummy
  notifications = [
    {
      icon: 'bx-user-plus',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      title: 'New student enrolled',
      description: 'John Doe joined your Math class',
      time: '2 minutes ago',
    },
    {
      icon: 'bx-task',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      title: 'Assignment submitted',
      description: '5 students submitted Algebra homework',
      time: '1 hour ago',
    },
    {
      icon: 'bx-calendar-event',
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      title: 'Class reminder',
      description: 'Math class starts in 30 minutes',
      time: '3 hours ago',
    },
  ];

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

    effect(() => {
      const currentRole = this.roleService.currentRole();

      if (currentRole === 'teacher') {
        this.mainMenu = this.teacherMenu;
        this.mainMenuMobile = this.teacherMenuMobile;
      } else if (currentRole === 'student') {
        this.mainMenu = this.studentMenu;
        this.mainMenuMobile = this.studentMenuMobile;
      } else {
        this.mainMenu = [];
        this.mainMenuMobile = [];
      }
    });
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

  // Logout Logic
  toLogin() {
    // Optional: Clear storage jika masih menyimpan token auth
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}
