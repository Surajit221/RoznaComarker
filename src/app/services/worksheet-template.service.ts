import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import type { WorksheetStructure } from '../models/worksheet-structure.model';

export type FileType = 'image' | 'pdf' | 'docx' | 'txt';

@Injectable({
  providedIn: 'root',
})
export class WorksheetTemplateService {
  constructor(private readonly http: HttpClient) {}
  /**
   * Detects the file type based on MIME type and extension
   * @param file - The file to analyze
   * @returns The detected file type
   */
  getFileType(file: File): FileType {
    const mimeType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();

    if (mimeType.startsWith('image/') || fileName.match(/\.(png|jpg|jpeg|gif|webp)$/)) {
      return 'image';
    }
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return 'pdf';
    }
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      return 'docx';
    }
    if (mimeType === 'text/plain' || fileName.endsWith('.txt')) {
      return 'txt';
    }

    // Default fallback based on extension
    if (fileName.endsWith('.docx')) return 'docx';
    if (fileName.endsWith('.pdf')) return 'pdf';
    if (fileName.endsWith('.txt')) return 'txt';
    if (fileName.match(/\.(png|jpg|jpeg|gif|webp)$/)) return 'image';

    // Default to txt if unknown
    return 'txt';
  }

  /**
   * Extracts text content from DOCX/TXT files for client-side validation
   * Note: This is a simple validation check. Actual extraction happens on the backend.
   * @param file - The file to extract text from
   * @returns Promise resolving to extracted text content
   */
  async extractTextContent(file: File): Promise<string> {
    const fileType = this.getFileType(file);

    if (fileType === 'txt') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read text file'));
        reader.readAsText(file);
      });
    }

    if (fileType === 'docx') {
      // For DOCX validation, just check if file has content
      // Actual extraction happens on backend
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          // Return a placeholder to indicate file can be read
          resolve('[DOCX content will be extracted on backend]');
        };
        reader.onerror = () => reject(new Error('Failed to read DOCX file'));
        reader.readAsArrayBuffer(file);
      });
    }

    throw new Error('Only TXT and DOCX files are supported for text extraction');
  }

  /**
   * Analyzes worksheet template structure by calling backend endpoint
   * @param file - The template file to analyze
   * @returns Promise resolving to detected worksheet structure
   * @throws Error if analysis fails
   */
  async analyzeTemplateStructure(file: File): Promise<WorksheetStructure | null> {
    const formData = new FormData();
    formData.append('templateFile', file);

    try {
      const response = await this.http
        .post<{ success: boolean; structure: WorksheetStructure; skipped?: boolean; reason?: string }>(
          `${environment.apiBaseUrl}/worksheets/analyze-template`,
          formData
        )
        .toPromise();

      // Check if analysis was skipped due to vision AI unavailability
      if (response?.skipped) {
        console.warn('[WorksheetTemplateService] Template analysis skipped:', response.reason);
        // Show toast message to user
        this.showToast('Template analysis unavailable right now. Generating from your topic instead.');
        return null; // Return null to indicate skipped
      }

      if (!response || !response.success) {
        throw new Error('Template analysis failed');
      }

      return response.structure;
    } catch (error: any) {
      console.error('Error analyzing template:', error);
      throw new Error(
        error.error?.message || error.message || 'Failed to analyze template. Please try again.'
      );
    }
  }

  /**
   * Checks if the detected structure is a diagram/labeling worksheet
   * @param structure - The worksheet structure to check
   * @returns True if the structure is a diagram template
   */
  isDiagramTemplate(structure: WorksheetStructure | null): boolean {
    if (!structure) return false;
    return structure.worksheetStyle === 'diagram' || structure.recommendedActivityType === 'labeling';
  }

  /**
   * Shows a toast message to the user
   * @param message - The message to display
   */
  private showToast(message: string): void {
    // Create a simple toast element
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #008081;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      font-family: 'Poppins', sans-serif;
      font-size: 14px;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;

    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    // Remove after 4 seconds
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        document.body.removeChild(toast);
        document.head.removeChild(style);
      }, 300);
    }, 4000);
  }

  /**
   * Returns a human-readable summary of the template structure
   * @param structure - The worksheet structure to summarize
   * @returns A formatted summary string
   */
  getTemplateSummary(structure: WorksheetStructure): string {
    const layoutMap: Record<string, string> = {
      single_column: 'Single Column',
      two_column: 'Two Column',
      grid: 'Grid',
      mixed: 'Mixed Layout',
    };

    const layoutText = layoutMap[structure.pageLayout] || structure.pageLayout;
    const sectionsCount = structure.sections?.length || 0;
    const totalQuestions = structure.totalQuestions || 0;
    const styleText = structure.visualStyle || 'Structured';

    return `${layoutText} layout • ${sectionsCount} sections • ${totalQuestions} questions total • ${styleText} style`;
  }

  /**
   * Generates a worksheet from a detected structure using backend endpoint
   * @param structure - The detected worksheet structure to follow
   * @param formData - Form data including topic, subject, grade, language, difficulty
   * @returns Promise resolving to generated worksheet JSON string
   * @throws Error if generation fails
   */
  async generateFromTemplate(structure: WorksheetStructure, formData: {
    topic: string;
    subject: string;
    grade: string;
    language: string;
    difficulty: string;
  }): Promise<string> {
    // Build the prompt with structure and form data
    const prompt = `You are an expert teacher creating an educational worksheet.
Generate a complete worksheet following EXACTLY this structure:
${JSON.stringify(structure, null, 2)}

Rules:
- Keep the same number of sections and questions as the structure
- Match the same activity types (multiple_choice, fill_blank, etc.)
- Topic: ${formData.topic}
- Subject: ${formData.subject}
- Grade: ${formData.grade}
- Language: ${formData.language}
- Difficulty: ${formData.difficulty}

Return the worksheet as structured JSON matching the existing worksheet output format already used in this project.`;

    try {
      const response = await this.http
        .post<{ success: boolean; worksheet: any }>(
          `${environment.apiBaseUrl}/worksheets/generate`,
          {
            inputType: 'topic',
            content: prompt,
            language: formData.language,
            difficulty: formData.difficulty,
          }
        )
        .toPromise();

      if (!response || !response.success) {
        throw new Error('Worksheet generation failed');
      }

      return JSON.stringify(response.worksheet);
    } catch (error: any) {
      console.error('Error generating worksheet from template:', error);
      throw new Error(
        error.error?.message || error.message || 'Failed to generate worksheet from template.'
      );
    }
  }
}
