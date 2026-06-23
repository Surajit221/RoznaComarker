import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { WorksheetActivity9Field } from '../../../api/worksheet-api.service';

@Component({
  selector: 'app-field-editor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './field-editor-modal.component.html',
  styleUrl: './field-editor-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldEditorModalComponent implements OnDestroy {
  @Input() show: boolean = false;
  @Input() imageUrl: string = '';
  @Input() imageWidth: number = 0;
  @Input() imageHeight: number = 0;
  @Input() initialFields: WorksheetActivity9Field[] = [];
  @Input() worksheetTitle: string = '';

  @Output() showChange = new EventEmitter<boolean>();
  @Output() confirmed = new EventEmitter<WorksheetActivity9Field[]>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('imageWrapper', { static: false }) imageWrapper!: ElementRef<HTMLDivElement>;
  @ViewChild('worksheetImage', { static: false }) worksheetImageRef!: ElementRef<HTMLImageElement>;

  fields: WorksheetActivity9Field[] = [];
  selectedFieldId: string | null = null;
  isDragging: boolean = false;
  dragOffsetX: number = 0;
  dragOffsetY: number = 0;
  imageNativeWidth: number = 0;
  imageNativeHeight: number = 0;
  isAddingField: boolean = false;

  ngOnChanges(): void {
    if (this.show) {
      // Deep copy initialFields to fields
      this.fields = JSON.parse(JSON.stringify(this.initialFields));
    }
  }

  onImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.imageNativeWidth = img.naturalWidth;
    this.imageNativeHeight = img.naturalHeight;
  }

  private getImageRect(): DOMRect {
    return this.worksheetImageRef.nativeElement.getBoundingClientRect();
  }

  onImageClick(event: MouseEvent): void {
    if (!this.isAddingField) return;
    event.stopPropagation();

    // Use image rect directly
    const imgRect = this.getImageRect();

    const xPct = ((event.clientX - imgRect.left) / imgRect.width) * 100;
    const yPct = ((event.clientY - imgRect.top) / imgRect.height) * 100;

    // Create new field at click position
    const newField: WorksheetActivity9Field = {
      id: `field_${Date.now()}`,
      label: `Field ${this.fields.length + 1}`,
      x: Math.max(0, Math.min(xPct - 10, 80)),
      y: Math.max(0, Math.min(yPct - 3, 90)),
      width: 20,
      height: 6,
      type: 'text',
      expectedAnswer: '',
      hint: ''
    };

    this.fields = [...this.fields, newField];
    this.selectedFieldId = newField.id;
    this.isAddingField = false; // exit add mode after placing
  }

  onFieldMouseDown(event: MouseEvent, fieldId: string): void {
    if (this.isAddingField) return;
    event.preventDefault();
    event.stopPropagation();

    const field = this.fields.find(f => f.id === fieldId);
    if (!field) return;

    // Get ACTUAL image position on screen
    const imgRect = this.getImageRect();

    // Where is the field's top-left corner in screen pixels?
    const fieldScreenX = imgRect.left + (field.x / 100) * imgRect.width;
    const fieldScreenY = imgRect.top + (field.y / 100) * imgRect.height;

    // How far from field top-left did we click?
    this.dragOffsetX = event.clientX - fieldScreenX;
    this.dragOffsetY = event.clientY - fieldScreenY;

    this.isDragging = true;
    this.selectedFieldId = fieldId;

    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging || !this.selectedFieldId) return;
    event.preventDefault();
    this.moveField(event.clientX, event.clientY);

    // Auto scroll wrapper when near edges
    const wrapper = this.imageWrapper.nativeElement;
    const wrapperRect = wrapper.getBoundingClientRect();
    const ZONE = 50;
    const SPEED = 6;

    if (event.clientY > wrapperRect.bottom - ZONE) {
      wrapper.scrollTop += SPEED;
    } else if (event.clientY < wrapperRect.top + ZONE) {
      wrapper.scrollTop -= SPEED;
    }
  }

  moveField(clientX: number, clientY: number): void {
    if (!this.selectedFieldId) return;

    const field = this.fields.find(f => f.id === this.selectedFieldId);
    if (!field) return;

    // Always use image element rect - this is the ground truth
    const imgRect = this.getImageRect();

    // Where should field top-left be in screen pixels?
    const newScreenX = clientX - this.dragOffsetX;
    const newScreenY = clientY - this.dragOffsetY;

    // Convert to percentage of image dimensions
    const newX = ((newScreenX - imgRect.left) / imgRect.width) * 100;
    const newY = ((newScreenY - imgRect.top) / imgRect.height) * 100;

    // Clamp so field stays within image bounds
    const clampedX = Math.max(0, Math.min(newX, 100 - field.width));
    const clampedY = Math.max(0, Math.min(newY, 100 - field.height));

    this.fields = this.fields.map(f => {
      if (f.id !== this.selectedFieldId) return f;
      return { ...f, x: clampedX, y: clampedY };
    });
  }

  onMouseUp(event?: MouseEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
  }

  onMouseLeave(event: MouseEvent): void {
    // Don't stop dragging on mouse leave - 
    // document listeners handle this
  }

  // Touch support for mobile
  onFieldTouchStart(event: TouchEvent, fieldId: string): void {
    event.preventDefault();
    event.stopPropagation();
    const touch = event.touches[0];

    const field = this.fields.find(f => f.id === fieldId);
    if (!field) return;

    const imgRect = this.getImageRect();
    const fieldScreenX = imgRect.left + (field.x / 100) * imgRect.width;
    const fieldScreenY = imgRect.top + (field.y / 100) * imgRect.height;

    this.dragOffsetX = touch.clientX - fieldScreenX;
    this.dragOffsetY = touch.clientY - fieldScreenY;
    this.isDragging = true;
    this.selectedFieldId = fieldId;
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.isDragging) return;
    event.preventDefault();
    const touch = event.touches[0];
    this.moveField(touch.clientX, touch.clientY);
  }

  onTouchEnd(event: TouchEvent): void {
    this.isDragging = false;
  }

  // Resize support
  onResizeStart(event: MouseEvent, fieldId: string): void {
    event.stopPropagation();
    event.preventDefault();

    const field = this.fields.find(f => f.id === fieldId);
    if (!field) return;

    const imgRect = this.getImageRect();
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startW = field.width;
    const startH = field.height;

    const onMove = (e: MouseEvent) => {
      const dx = ((e.clientX - startClientX) / imgRect.width) * 100;
      const dy = ((e.clientY - startClientY) / imgRect.height) * 100;

      this.fields = this.fields.map(f => {
        if (f.id !== fieldId) return f;
        return {
          ...f,
          width: Math.max(5, Math.min(startW + dx, 100 - f.x)),
          height: Math.max(3, Math.min(startH + dy, 100 - f.y))
        };
      });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onResizeTouchStart(event: TouchEvent, fieldId: string): void {
    event.stopPropagation();
    const touch = event.touches[0];
    this.onResizeStart({
      clientX: touch.clientX,
      clientY: touch.clientY,
      stopPropagation: () => {},
      preventDefault: () => {}
    } as any, fieldId);
  }

  deleteField(event: Event, fieldId: string): void {
    event.stopPropagation();
    this.fields = this.fields.filter(f => f.id !== fieldId);
    if (this.selectedFieldId === fieldId) {
      this.selectedFieldId = null;
    }
  }

  selectField(fieldId: string): void {
    this.selectedFieldId = fieldId;
  }

  toggleAddMode(): void {
    this.isAddingField = !this.isAddingField;
    this.selectedFieldId = null;
  }

  onFieldClick(event: Event, fieldId: string): void {
    event.stopPropagation();
    if (!this.isAddingField) {
      this.selectedFieldId = fieldId;
    }
  }

  onBackdropClick(event: Event): void {
    // Don't close on backdrop click - teacher might lose work
  }

  onCancel(): void {
    this.cancelled.emit();
    this.showChange.emit(false);
  }

  onConfirm(): void {
    if (this.fields.length === 0) return;
    this.confirmed.emit([...this.fields]);
    this.showChange.emit(false);
  }

  // Bound methods for document event listeners
  private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private boundMouseUp = (e: MouseEvent) => this.onMouseUp(e);

  ngOnDestroy(): void {
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
  }
}
