import { Component, HostListener, inject, Input } from '@angular/core';
import { Router } from '@angular/router';
import { DeviceService } from '../../../services/device.service';
import { TruncatePipe } from '../../../pipe/truncate.pipe';
import { AlertService } from '../../../services/alert.service';

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
  @Input() joinCode = '';

  device = inject(DeviceService);
  private alert = inject(AlertService);
  menuOpen = false;

  constructor(private router: Router) {}

  toDetailMyClasses() {
    if (!this.id) return;
    this.router.navigate(['/student/my-classes/detail/', this.id]);
  }

  onMenuClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.menuOpen = !this.menuOpen;
  }

  onMenuPanelClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();
  }

  onViewClass(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.menuOpen = false;
    this.toDetailMyClasses();
  }

  async onCopyClassCode(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.menuOpen = false;
    const code = String(this.joinCode || '').trim();
    if (!code) return;
    try {
      await this.writeClipboard(code);
      this.alert.showToast('Class code copied', 'success');
    } catch {
      this.alert.showError('Unable to copy class code', 'Please copy the class code manually.');
    }
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.menuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    this.menuOpen = false;
  }

  private async writeClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      if (!document.execCommand('copy')) throw new Error('Copy failed');
    } finally {
      textarea.remove();
    }
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
