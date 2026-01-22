import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class QrGeneratorService {
  
  generateClassJoinUrl(joinCode: string): string {
    // Generate a proper URL format for QR codes
    const baseUrl = environment.production
      ? (environment as any).FRONTEND_URL || ''
      : 'http://localhost:4200';
    
    return `${baseUrl}/student/join-class?joinCode=${encodeURIComponent(joinCode)}`;
  }

  generateQrValue(joinCode: string, useUrl: boolean = true): string {
    if (useUrl) {
      return this.generateClassJoinUrl(joinCode);
    }
    return joinCode;
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
