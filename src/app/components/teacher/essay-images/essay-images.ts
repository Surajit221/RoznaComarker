import { Component, HostListener, Input } from '@angular/core';
import { Marker, SAMPLE_MARKERS } from '../../../models/markers-data';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-essay-images',
  imports: [CommonModule],
  templateUrl: './essay-images.html',
  styleUrl: './essay-images.css',
})
export class EssayImages {
  @Input() imageUrl: string | null = null;

  markers: Marker[] = [];
  editMode = false;
  draggingId: number | null = null;

  constructor() {
    this.loadMarkers();
  }

  // Load from localStorage or use sample
  loadMarkers() {
    const raw = localStorage.getItem('essayMarkersV1');
    if (raw) {
      try {
        this.markers = JSON.parse(raw);
        return;
      } catch {
        console.warn('Failed to parse saved markers');
      }
    }
    this.markers = SAMPLE_MARKERS;
  }

  saveMarkers() {
    localStorage.setItem('essayMarkersV1', JSON.stringify(this.markers));
  }

  toggleTooltip(marker: Marker) {
    this.markers = this.markers.map(m =>
      m.id === marker.id
        ? { ...m, visible: !m.visible }
        : { ...m, visible: false }
    );
  }

  toggleAll() {
    const anyHidden = this.markers.some(m => !m.visible);
    this.markers = this.markers.map(m => ({ ...m, visible: anyHidden }));
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
  }

  startDrag(ev: PointerEvent, marker: Marker) {
    if (!this.editMode) return;
    ev.preventDefault();
    this.draggingId = marker.id;
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
  }

  stopDrag(ev: PointerEvent) {
    if (this.draggingId !== null) {
      try {
        (ev.target as HTMLElement).releasePointerCapture(ev.pointerId);
      } catch { }
      this.draggingId = null;
      this.saveMarkers();
    }
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(ev: PointerEvent) {
    if (this.draggingId === null) return;
    const img = document.querySelector('.image-container img') as HTMLImageElement | null;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 100;
    const y = ((ev.clientY - rect.top) / rect.height) * 100;
    const clampedX = Math.max(1, Math.min(99, x));
    const clampedY = Math.max(1, Math.min(99, y));
    this.markers = this.markers.map(m =>
      m.id === this.draggingId ? { ...m, left: clampedX, top: clampedY } : m
    );
  }

  resetToSample() {
    this.markers = [...SAMPLE_MARKERS];
    this.saveMarkers();
  }

  @HostListener('document:click', ['$event'])
  hideTooltipsOnOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('.marker') || target.closest('.tooltip')) return;
    this.markers = this.markers.map(m => ({ ...m, visible: false }));
  }
}
