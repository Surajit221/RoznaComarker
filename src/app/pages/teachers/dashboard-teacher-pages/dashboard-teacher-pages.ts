import { Component, inject } from '@angular/core';
import { DeviceService } from '../../../services/device.service';

@Component({
  selector: 'app-dashboard-teacher-pages',
  imports: [],
  templateUrl: './dashboard-teacher-pages.html',
  styleUrl: './dashboard-teacher-pages.css',
})
export class DashboardTeacherPages {
  device = inject(DeviceService);
}
