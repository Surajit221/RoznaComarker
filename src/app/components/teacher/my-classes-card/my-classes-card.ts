import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { Router } from '@angular/router';
import { DeviceService } from '../../../services/device.service';
import { TruncatePipe } from '../../../pipe/truncate.pipe';

@Component({
  selector: 'app-my-classes-card',
  imports: [CommonModule, TruncatePipe],
  templateUrl: './my-classes-card.html',
  styleUrl: './my-classes-card.css',
})
export class MyClassesCard {
  @Input() image!: string;
  @Input() title!: string;
  @Input() students!: number;
  @Input() assignments!: number;
  @Input() submissions!: number;
  @Input() description!: string;

  device = inject(DeviceService);

  constructor(private router: Router) {}

  toDetailMyClasses() {
    this.router.navigate(['/teacher/my-classes/detail/', 'creative-essay-practice']);
  }
}
