import { Injectable } from '@angular/core';
import { AlertService } from './alert.service';

export interface ErrorContext {
  operation: string;
  component?: string;
  userId?: string;
  additionalInfo?: Record<string, any>;
}

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService {
  constructor(private alert: AlertService) {}

  handleError(error: any, context: ErrorContext): void {
    console.error(`Error in ${context.operation}:`, error, context);

    const errorMessage = this.getErrorMessage(error);
    const userMessage = this.getUserFriendlyMessage(error, context);

    // Show user-friendly message
    this.alert.showError(context.operation, userMessage);

    // Log detailed error for debugging
    this.logError(error, context, errorMessage);
  }

  private getErrorMessage(error: any): string {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.error?.message) return error.error.message;
    if (error?.statusText) return error.statusText;
    return 'Unknown error occurred';
  }

  private getUserFriendlyMessage(error: any, context: ErrorContext): string {
    const errorMessage = this.getErrorMessage(error).toLowerCase();
    
    // Network errors
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return 'Network connection issue. Please check your internet connection and try again.';
    }

    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
      return 'Permission denied. Please grant the necessary permissions and try again.';
    }

    // Not found errors
    if (errorMessage.includes('not found') || error?.status === 404) {
      return 'The requested resource was not found. Please check and try again.';
    }

    // Validation errors
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return 'Invalid input provided. Please check your information and try again.';
    }

    // Server errors
    if (error?.status >= 500) {
      return 'Server is temporarily unavailable. Please try again in a few moments.';
    }

    // Unauthorized errors
    if (error?.status === 401) {
      return 'Authentication required. Please log in and try again.';
    }

    // Forbidden errors
    if (error?.status === 403) {
      return 'You do not have permission to perform this action.';
    }

    // Rate limiting
    if (errorMessage.includes('rate limit') || error?.status === 429) {
      return 'Too many requests. Please wait a moment and try again.';
    }

    // Default message
    return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
  }

  private logError(error: any, context: ErrorContext, errorMessage: string): void {
    const errorLog = {
      timestamp: new Date().toISOString(),
      context,
      error: {
        message: errorMessage,
        status: error?.status,
        statusText: error?.statusText,
        stack: error?.stack,
        fullError: error
      }
    };

    // In production, you would send this to your logging service
    console.error('Error Log:', errorLog);
    
    // For now, just log to console
    // TODO: Integrate with error tracking service like Sentry
  }

  handleAsyncError<T>(
    promise: Promise<T>, 
    context: ErrorContext
  ): Promise<[T | null, Error | null]> {
    return promise
      .then<[T, null]>((data: T) => [data, null])
      .catch<[null, Error]>((error: Error) => {
        this.handleError(error, context);
        return [null, error];
      });
  }
}
