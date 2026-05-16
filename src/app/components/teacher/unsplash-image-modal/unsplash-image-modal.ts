import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { UnsplashService, UnsplashImage } from '../../../services/unsplash.service';

@Component({
  selector: 'app-unsplash-image-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './unsplash-image-modal.html',
  styleUrl: './unsplash-image-modal.css'
})
export class UnsplashImageModal {
  @Input() show = false;
  @Output() showChange = new EventEmitter<boolean>();
  @Output() imageSelected = new EventEmitter<string>();

  private unsplashService = inject(UnsplashService);

  searchQuery = '';
  images: UnsplashImage[] = [];
  isLoading = false;
  error: string | null = null;

  async searchImages() {
    if (!this.searchQuery.trim()) {
      this.error = 'Please enter a search query';
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const response = await firstValueFrom(this.unsplashService.searchImages(this.searchQuery, 12));
      this.images = response.data || [];
      
      if (this.images.length === 0) {
        this.error = 'No images found for this search query';
      }
    } catch (err: any) {
      console.error('Unsplash search error:', err);
      this.error = err.message || 'Failed to search images. Please try again.';
      this.images = [];
    } finally {
      this.isLoading = false;
    }
  }

  selectImage(imageUrl: string) {
    this.imageSelected.emit(imageUrl);
    this.close();
  }

  close() {
    this.show = false;
    this.showChange.emit(false);
    this.searchQuery = '';
    this.images = [];
    this.error = null;
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('uim-backdrop')) {
      this.close();
    }
  }
}
