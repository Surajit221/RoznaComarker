import { Component, inject } from '@angular/core';
import { DeviceService } from '../../../services/device.service';

@Component({
  selector: 'app-dashboard-student-pages',
  imports: [],
  templateUrl: './dashboard-student-pages.html',
  styleUrl: './dashboard-student-pages.css',
})
export class DashboardStudentPages {
  device = inject(DeviceService);
}
