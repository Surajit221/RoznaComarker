import { Component, inject, Input } from '@angular/core';
import { Router } from '@angular/router';
import { DeviceService } from '../../../services/device.service';
import { TruncatePipe } from '../../../pipe/truncate.pipe';

@Component({
  selector: 'app-my-classes-card-student',
  imports: [TruncatePipe],
  templateUrl: './my-classes-card-student.html',
  styleUrl: './my-classes-card-student.css',
})
export class MyClassesCardStudent {
  @Input() id?: string;
  @Input() image!: string;
  @Input() title!: string;
  @Input() students!: number;
  @Input() assignments!: number;
  @Input() submissions!: number;
  @Input() description!: string;
  @Input() teacher!: string;
  @Input() lastEdited!: string;

  device = inject(DeviceService);

  constructor(private router: Router) {}

  toDetailMyClasses() {
    if (!this.id) return;
    this.router.navigate(['/student/my-classes/detail/', this.id]);
  }

  formatLastEdited(): string {
    if (!this.lastEdited) return '';
    
    const now = new Date();
    const lastEdited = new Date(this.lastEdited);
    const diffMs = now.getTime() - lastEdited.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `Updated ${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `Updated ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `Updated ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return `Updated ${lastEdited.toLocaleDateString()}`;
  }
}
