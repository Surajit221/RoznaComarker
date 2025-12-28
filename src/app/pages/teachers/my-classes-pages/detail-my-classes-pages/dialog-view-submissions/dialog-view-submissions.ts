import { Component, EventEmitter, inject, Output } from '@angular/core';
import { Router } from '@angular/router';
import { DeviceService } from '../../../../../services/device.service';

@Component({
  selector: 'app-dialog-view-submissions',
  imports: [],
  templateUrl: './dialog-view-submissions.html',
  styleUrl: './dialog-view-submissions.css',
})
export class DialogViewSubmissions {
  @Output() closed = new EventEmitter<void>();
  device = inject(DeviceService);

  students = [
    {
      name: 'Sarah Connor',
      image: 'https://randomuser.me/api/portraits/women/1.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'John Reese',
      image: 'https://randomuser.me/api/portraits/men/12.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'Emily Stone',
      image: 'https://randomuser.me/api/portraits/women/8.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'Michael Lee',
      image: 'https://randomuser.me/api/portraits/men/9.jpg',
      status: 'INVITED',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'Sophia Brown',
      image: 'https://randomuser.me/api/portraits/women/5.jpg',
      status: 'ACTIVE',
      submitted: 3,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'Ethan Davis',
      image: 'https://randomuser.me/api/portraits/men/7.jpg',
      status: 'INVITED',
      submitted: 2,
      total: 4,
      lastActivity: 'Nov 04, 2025',
    },
    {
      name: 'Ava Johnson',
      image: 'https://randomuser.me/api/portraits/women/9.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 05, 2025',
    },
    {
      name: 'Noah Wilson',
      image: 'https://randomuser.me/api/portraits/men/3.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 03, 2025',
    },
    {
      name: 'Isabella Martinez',
      image: 'https://randomuser.me/api/portraits/women/6.jpg',
      status: 'INVITED',
      submitted: 1,
      total: 4,
      lastActivity: 'Nov 02, 2025',
    },
    {
      name: 'Liam Anderson',
      image: 'https://randomuser.me/api/portraits/men/2.jpg',
      status: 'ACTIVE',
      submitted: 4,
      total: 4,
      lastActivity: 'Nov 01, 2025',
    },
  ];

  constructor(private router: Router) { }

  toStudentSubmission() {
    this.closeDialog();
    this.router.navigate(['/teacher/my-classes/detail/student-submissions/nana']);
  }

  closeDialog() {
    this.closed.emit();
  }
}
