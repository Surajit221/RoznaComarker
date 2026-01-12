import { Component, Input, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-chart-storage',
  imports: [],
  templateUrl: './chart-storage.html',
  styleUrl: './chart-storage.css',
})
export class ChartStorage {
  @Input() used: number = 12; // GB used
  @Input() total: number = 15; // Total GB
  @Input() strokeColor: string = '#3b82f6'; // Default blue color
  @Input() size: number = 200; // Size in pixels

  percentage: number = 0;
  circumference: number = 0;
  strokeDashoffset: number = 0;

  ngOnInit() {
    this.calculateChart();
    // Animate on init
    setTimeout(() => {
      this.animateChart();
    }, 300);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['used'] || changes['total']) {
      this.calculateChart();
      this.animateChart();
    }
  }

  calculateChart() {
    const total = Number(this.total);
    const used = Number(this.used);
    const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
    const safeUsed = Number.isFinite(used) && used > 0 ? used : 0;
    this.percentage = safeTotal > 0 ? Math.round((safeUsed / safeTotal) * 100) : 0;
    const radius = 54; // SVG circle radius
    this.circumference = 2 * Math.PI * radius;
    this.strokeDashoffset = this.circumference - (this.percentage / 100) * this.circumference;
  }

  animateChart() {
    // Reset to 0 for animation
    const initialOffset = this.circumference;
    this.strokeDashoffset = initialOffset;

    // Animate to calculated value
    setTimeout(() => {
      this.strokeDashoffset = this.circumference - (this.percentage / 100) * this.circumference;
    }, 50);
  }
}
