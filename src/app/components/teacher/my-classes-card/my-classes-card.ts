import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, inject, Input, Output } from '@angular/core';
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
  @Input() id?: string;
  @Input() image!: string;
  @Input() title!: string;
  @Input() students!: number;
  @Input() assignments!: number;
  @Input() submissions!: number;
  @Input() description!: string;
  @Input() lastEdited!: string;

  @Output() editRequested = new EventEmitter<{ id: string; title: string; description: string }>();
  @Output() deleteRequested = new EventEmitter<{ id: string; title: string }>();

  device = inject(DeviceService);

  menuOpen = false;

  constructor(private router: Router) {}

  toDetailMyClasses() {
    if (!this.id) return;
    this.router.navigate(['/teacher/my-classes/detail/', this.id]);
  }

  onMenuClick(event: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    this.menuOpen = !this.menuOpen;
  }

  @HostListener('document:click')
  onDocumentClick() {
    if (this.menuOpen) this.menuOpen = false;
  }

  onMenuPanelClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();
  }

  onEditClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.id) return;
    this.menuOpen = false;
    this.editRequested.emit({ id: this.id, title: this.title, description: this.description });
  }

  onDeleteClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.id) return;
    this.menuOpen = false;
    this.deleteRequested.emit({ id: this.id, title: this.title });
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
    if (diffMins < 60) return `edited ${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `edited ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `edited ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return `edited ${lastEdited.toLocaleDateString()}`;
  }
}
