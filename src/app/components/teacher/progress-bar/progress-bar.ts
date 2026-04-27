import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-progress-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './progress-bar.html',
  styleUrl: './progress-bar.css',
})
export class ProgressBarComponent {
  @Input() completed = 0;
  @Input() total = 4;
  @Input() title = 'Activities Completed';
  @Input() subtitle = 'Keep going to unlock the final score.';

  get percentage(): number {
    if (this.total <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, (this.completed / this.total) * 100));
  }
}
