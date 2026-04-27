import { Component, inject } from '@angular/core';
import { DeviceService } from '../../../services/device.service';
import { TruncatePipe } from "../../../pipe/truncate.pipe";
import { CommonModule } from '@angular/common';
import { BottomsheetDialog } from '../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { Router } from '@angular/router';
import { NotificationApiService, type BackendNotification } from '../../../api/notification-api.service';
import { NotificationRealtimeService } from '../../../services/notification-realtime.service';

@Component({
  selector: 'app-my-notification-student-pages',
  imports: [TruncatePipe, CommonModule, BottomsheetDialog],
  templateUrl: './my-notification-student-pages.html',
  styleUrl: './my-notification-student-pages.css',
})
export class MyNotificationStudentPages {
  device = inject(DeviceService);
  private router = inject(Router);
  private notificationApi = inject(NotificationApiService);
  private realtime = inject(NotificationRealtimeService);

  openSheet = false;

  notifications: BackendNotification[] = [];

  isLoading = false;

  async ngOnInit() {
    await this.load();

    this.realtime.connect();
    this.realtime.notifications$.subscribe((n) => {
      this.notifications = [n, ...(this.notifications || [])];
    });
  }

  async onMarkAllRead() {
    try {
      await this.notificationApi.markAllRead();
      const now = new Date().toISOString();
      this.notifications = (this.notifications || []).map((x) => ({
        ...x,
        readAt: x.readAt || now
      }));
    } catch {
      // ignore
    }
  }

  async onMarkRead(event: Event, n: BackendNotification) {
    event.stopPropagation();
    if (!n?._id || n.readAt) return;

    const now = new Date().toISOString();
    this.notifications = (this.notifications || []).map((x) => (x._id === n._id ? { ...x, readAt: now } : x));

    try {
      await this.notificationApi.markRead(n._id);
    } catch {
      await this.load();
    }
  }

  ngOnDestroy() {
    this.realtime.disconnect();
  }

  private async load() {
    if (this.isLoading) return;
    this.isLoading = true;
    try {
      this.notifications = await this.notificationApi.listMyNotifications(100);
    } finally {
      this.isLoading = false;
    }
  }

  iconFor(n: BackendNotification): { icon: string; iconBg: string; iconColor: string } {
    if (n?.type === 'assignment_uploaded') {
      return { icon: 'bxs-book', iconBg: 'bg-[#D7DBFF]', iconColor: 'text-[#2F2F9F]' };
    }
    if (n?.type === 'assignment_removed') {
      return { icon: 'bxs-trash', iconBg: 'bg-[#FFE3E3]', iconColor: 'text-[#B42318]' };
    }
    if (n?.type === 'assignment_submitted') {
      return { icon: 'bxs-check-circle', iconBg: 'bg-[#B0F8D5]', iconColor: 'text-[#136C6D]' };
    }
    return { icon: 'bxs-bell', iconBg: 'bg-[#F3F3F3]', iconColor: 'text-[#474747]' };
  }

  timeFor(n: BackendNotification): string {
    const raw = (n as any)?.createdAt;
    const d = raw ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  async onClickNotification(n: BackendNotification) {
    const route: any = n?.data?.route;
    if (!route || typeof route.path !== 'string') return;

    try {
      if (n?._id && !n.readAt) {
        await this.notificationApi.markRead(n._id);
      }
    } catch {
      // ignore
    }

    const commands: any[] = [route.path, ...(Array.isArray(route.params) ? route.params : [])];
    this.router.navigate(commands, {
      queryParams: route.queryParams || undefined
    });
  }

  onCloseSheetDetailNotification() {
    document.body.classList.remove('overflow-hidden');
    this.openSheet = false;
  }

  onOpenSheet() {
    document.body.classList.add('overflow-hidden');
    this.openSheet = true;
  }

}
