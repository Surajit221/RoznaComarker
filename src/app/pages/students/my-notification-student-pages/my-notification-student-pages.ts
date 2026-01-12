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

  notifications: Array<{
    icon: string;
    iconBg: string;
    iconColor: string;
    title: string;
    description: string;
    time: string;
  }> = [];

  onCloseSheetDetailNotification() {
    document.body.classList.remove('overflow-hidden');
    this.openSheet = false;
  }

  onOpenSheet() {
    document.body.classList.add('overflow-hidden');
    this.openSheet = true;
  }

}
