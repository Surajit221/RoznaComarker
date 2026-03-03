import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type BackendNotificationRoute = {
  path: string;
  params?: string[];
  queryParams?: Record<string, any>;
};

export type BackendNotification = {
  _id: string;
  recipient: string;
  actor?: any;
  type: string;
  title: string;
  description: string;
  data?: {
    classId?: string;
    assignmentId?: string;
    submissionId?: string;
    studentId?: string;
    route?: BackendNotificationRoute;
    [k: string]: any;
  };
  readAt?: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable({ providedIn: 'root' })
export class NotificationApiService {
  constructor(private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return `${environment.apiUrl}/api`;
  }

  private logHttpError(context: string, err: unknown) {
    if (err instanceof HttpErrorResponse) {
      console.error(`[${context}] HTTP error`, {
        url: err.url,
        status: err.status,
        statusText: err.statusText,
        message: err.message,
        error: err.error
      });
      return;
    }

    console.error(`[${context}] Unknown error`, err);
  }

  async listMyNotifications(limit = 50): Promise<BackendNotification[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<BackendNotification[]>>(
          `${apiBaseUrl}/notifications?limit=${encodeURIComponent(String(limit))}`
        )
      );
      return resp?.data || [];
    } catch (err: unknown) {
      this.logHttpError('listMyNotifications', err);
      throw err;
    }
  }

  async markRead(id: string): Promise<BackendNotification> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.patch<BackendResponse<BackendNotification>>(
          `${apiBaseUrl}/notifications/${encodeURIComponent(id)}/read`,
          {}
        )
      );
      return resp.data;
    } catch (err: unknown) {
      this.logHttpError('markRead', err);
      throw err;
    }
  }

  async getUnreadCount(): Promise<number> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<{ count: number }>>(`${apiBaseUrl}/notifications/unread-count`)
      );
      const n = Number(resp?.data?.count);
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    } catch (err: unknown) {
      this.logHttpError('getUnreadCount', err);
      throw err;
    }
  }

  async markAllRead(): Promise<void> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      await firstValueFrom(
        this.http.patch<BackendResponse<{ readAt: string }>>(
          `${apiBaseUrl}/notifications/read-all`,
          {}
        )
      );
    } catch (err: unknown) {
      this.logHttpError('markAllRead', err);
      throw err;
    }
  }
}
