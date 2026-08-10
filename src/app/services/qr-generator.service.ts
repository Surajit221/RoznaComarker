import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class QrGeneratorService {
  private getFrontendBaseUrl(): string {
    const configuredUrl = environment.FRONTEND_URL || '';
    if (environment.production) return configuredUrl.replace(/\/+$/, '');
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin.replace(/\/+$/, '');
    }
    return configuredUrl.replace(/\/+$/, '');
  }
  
  generateClassJoinUrl(joinCode: string): string {
    // Generate a proper URL format for QR codes
    const baseUrl = this.getFrontendBaseUrl();
    
    return `${baseUrl}/student/join-class?joinCode=${encodeURIComponent(joinCode)}`;
  }

  generateQrValue(joinCode: string, useUrl: boolean = true): string {
    if (useUrl) {
      return this.generateClassJoinUrl(joinCode);
    }
    return joinCode;
  }

  generateAssignmentUrl(qrToken: string): string {
    const baseUrl = this.getFrontendBaseUrl();
    return `${baseUrl}/student/assignments/qr/${encodeURIComponent(qrToken)}`;
  }

  generateFlashcardSetUrl(flashcardSetId: string): string {
    const baseUrl = this.getFrontendBaseUrl();
    return `${baseUrl}/flashcards/${flashcardSetId}`;
  }

  generateFlashcardQrValue(flashcardSetId: string): string {
    return this.generateFlashcardSetUrl(flashcardSetId);
  }

  validateJoinCode(joinCode: string): boolean {
    // Basic validation for join code format
    if (!joinCode || typeof joinCode !== 'string') {
      return false;
    }
    
    // Check if it's a valid format (alphanumeric, 6-12 characters)
    const codePattern = /^[A-Z0-9]{6,12}$/i;
    return codePattern.test(joinCode.trim());
  }

  extractJoinCodeFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('joinCode');
    } catch {
      // If it's not a valid URL, check if it's a direct join code
      if (this.validateJoinCode(url)) {
        return url;
      }
      return null;
    }
  }
}
