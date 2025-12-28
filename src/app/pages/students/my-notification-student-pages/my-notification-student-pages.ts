import { Component, inject } from '@angular/core';
import { DeviceService } from '../../../services/device.service';
import { TruncatePipe } from "../../../pipe/truncate.pipe";
import { CommonModule } from '@angular/common';
import { BottomsheetDialog } from '../../../shared/bottomsheet-dialog/bottomsheet-dialog';

@Component({
  selector: 'app-my-notification-student-pages',
  imports: [TruncatePipe, CommonModule, BottomsheetDialog],
  templateUrl: './my-notification-student-pages.html',
  styleUrl: './my-notification-student-pages.css',
})
export class MyNotificationStudentPages {
  device = inject(DeviceService);
  openSheet = false;

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

  onCloseSheetDetailNotification() {
    document.body.classList.remove('overflow-hidden');
    this.openSheet = false;
  }

  onOpenSheet() {
    document.body.classList.add('overflow-hidden');
    this.openSheet = true;
  }

}
