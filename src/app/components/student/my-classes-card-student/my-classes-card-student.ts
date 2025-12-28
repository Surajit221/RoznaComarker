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
  @Input() image!: string;
  @Input() title!: string;
  @Input() students!: number;
  @Input() assignments!: number;
  @Input() submissions!: number;
  @Input() description!: string;
  @Input() teacher!: string;

  device = inject(DeviceService);

  constructor(private router: Router) {}

  toDetailMyClasses() {
    this.router.navigate(['/student/my-classes/detail/', 'creative-essay-practice']);
  }
}
