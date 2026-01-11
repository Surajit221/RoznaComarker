import { Component, inject } from '@angular/core';
import { DeviceService } from '../../../services/device.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-my-profile-pages',
  imports: [CommonModule],
  templateUrl: './my-profile-pages.html',
  styleUrl: './my-profile-pages.css',
})
export class MyProfilePages {
  device = inject(DeviceService);
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
  activeTab = 'general';
}
