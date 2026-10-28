import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, inject, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { AppliedCrop, cropImage, CropRect } from './image-crop.util';

@Component({
  selector: 'app-image-crop',
  templateUrl: './image-crop.html',
  styleUrl: './image-crop.css',
})
export class ImageCrop implements AfterViewInit, OnDestroy {
  @Input({ required: true }) original!: File;
  @Input() initial?: CropRect;
  @Input() disabled = false;
  @Output() applied = new EventEmitter<AppliedCrop>();
  @Output() cancelled = new EventEmitter<void>();
  @ViewChild('photo') photo!: ElementRef<HTMLImageElement>;
  @ViewChild('heading') heading!: ElementRef<HTMLElement>;
  private cdr = inject(ChangeDetectorRef);
  private destroyed = false;
  private drag?: { id: number; x: number; y: number; rect: CropRect; action: string };
  url = '';
  rect: CropRect = { x: 0, y: 0, width: 1, height: 1 };
  loaded = false;
  busy = false;
  error = '';
  readonly edges = ['left', 'top', 'right', 'bottom'] as const;
  readonly corners = ['nw', 'ne', 'sw', 'se'];

  ngAfterViewInit(): void {
    this.url = URL.createObjectURL(this.original);
    this.rect = this.initial ? { ...this.initial } : this.rect;
    this.heading.nativeElement.focus();
    this.cdr.detectChanges();
  }
  onLoad(): void {
    const image = this.photo.nativeElement;
    this.loaded = image.naturalWidth > 0 && image.naturalHeight > 0;
    if (image.naturalWidth * image.naturalHeight > 48 * 1024 * 1024) {
      this.loaded = false; this.error = 'This image is too large to edit here. Use the original image or choose a smaller photo.';
    }
  }
  edge(edge: string): number {
    return Math.round(1000 * (edge === 'left' ? this.rect.x : edge === 'top' ? this.rect.y
      : edge === 'right' ? this.rect.x + this.rect.width : this.rect.y + this.rect.height)) / 10;
  }
  setEdge(edge: string, event: Event): void {
    if (this.busy || this.disabled) return;
    const value = (event.target as HTMLInputElement).valueAsNumber / 100;
    if (!Number.isFinite(value)) return;
    const r = this.rect, right = r.x + r.width, bottom = r.y + r.height;
    const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
    if (edge === 'left') { const x = clamp(value, 0, right - .01); this.rect = { ...r, x, width: right - x }; }
    if (edge === 'top') { const y = clamp(value, 0, bottom - .01); this.rect = { ...r, y, height: bottom - y }; }
    if (edge === 'right') this.rect = { ...r, width: clamp(value, r.x + .01, 1) - r.x };
    if (edge === 'bottom') this.rect = { ...r, height: clamp(value, r.y + .01, 1) - r.y };
  }
  start(event: PointerEvent, action: string): void {
    if (!this.loaded || this.busy || this.disabled || event.button !== 0 || this.drag) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, rect: { ...this.rect }, action };
  }
  move(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId || this.busy || this.disabled) return;
    const bounds = this.photo.nativeElement.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dx = (event.clientX - drag.x) / bounds.width, dy = (event.clientY - drag.y) / bounds.height;
    const r = drag.rect, clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
    if (drag.action === 'move') {
      this.rect = { ...r, x: clamp(r.x + dx, 0, 1 - r.width), y: clamp(r.y + dy, 0, 1 - r.height) }; return;
    }
    let left = r.x, top = r.y, right = r.x + r.width, bottom = r.y + r.height;
    if (drag.action.includes('w')) left = clamp(left + dx, 0, right - .01);
    if (drag.action.includes('e')) right = clamp(right + dx, left + .01, 1);
    if (drag.action.includes('n')) top = clamp(top + dy, 0, bottom - .01);
    if (drag.action.includes('s')) bottom = clamp(bottom + dy, top + .01, 1);
    this.rect = { x: left, y: top, width: right - left, height: bottom - top };
  }
  end(): void { this.drag = undefined; }
  async apply(): Promise<void> {
    if (!this.loaded || this.busy || this.disabled) return;
    this.busy = true; this.error = '';
    const rect = { ...this.rect };
    try {
      const file = await cropImage(this.photo.nativeElement, this.original, rect);
      if (!this.destroyed && !this.disabled) this.applied.emit({ file, rect });
    } catch (error) {
      if (!this.destroyed) this.error = error instanceof Error ? error.message : 'Unable to create the crop. Please try again.';
    } finally { if (!this.destroyed) { this.busy = false; this.cdr.markForCheck(); } }
  }
  ngOnDestroy(): void { this.destroyed = true; this.end(); if (this.url) URL.revokeObjectURL(this.url); }
}
