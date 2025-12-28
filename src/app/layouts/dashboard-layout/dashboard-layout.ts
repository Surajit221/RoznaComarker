import { CommonModule, Location } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { DeviceService } from '../../services/device.service';
import { ChartStorage } from '../../shared/chart-storage/chart-storage';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule, ChartStorage],
  templateUrl: './dashboard-layout.html',
  styleUrls: ['./dashboard-layout.css'],
})
export class DashboardLayout {
  role = localStorage.getItem('role');
  isUserDropdownOpen = signal(false);
  isNotificationsDropdownOpen = false;

  showAppBar = signal(false);
  showBottomNav = signal(true);

  device = inject(DeviceService);

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

  ngOnInit() {
    this.mainMenu = this.role === 'student' ? this.studentMenu : this.teacherMenu;
    this.mainMenuMobile = this.role === 'student' ? this.studentMenuMobile : this.teacherMenuMobile;
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

  toLogin() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}
