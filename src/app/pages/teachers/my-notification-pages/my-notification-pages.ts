import { Component, inject } from '@angular/core';
import { TruncatePipe } from "../../../pipe/truncate.pipe";
import { CommonModule } from '@angular/common';
import { BottomsheetDialog } from '../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { DeviceService } from '../../../services/device.service';

@Component({
  selector: 'app-my-notification-pages',
  imports: [TruncatePipe, CommonModule, BottomsheetDialog],
  templateUrl: './my-notification-pages.html',
  styleUrl: './my-notification-pages.css',
})
export class MyNotificationPages {
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
