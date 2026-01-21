import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { CacheService } from '../services/cache.service';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type BackendClass = {
  _id: string;
  name: string;
  description?: string;
  teacher: string;
  joinCode: string;
  qrCodeUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BackendClassStudent = {
  id: string;
  name: string;
  email: string;
  joinedAt: string | null;
};

export type BackendClassSummary = {
  id: string;
  name: string;
  description: string;
  joinCode: string;
  teacher: {
    id: string;
    name: string;
    email: string;
  };
  studentsCount: number;
  assignmentsCount: number;
  submissionsCount: number;
  lastEdited: string;
};

@Injectable({ providedIn: 'root' })
export class ClassApiService {
  constructor(
    private http: HttpClient,
    private cache: CacheService
  ) {}

  async getMyTeacherClasses(): Promise<BackendClass[]> {
    const cacheKey = 'my-teacher-classes';
    const cached = this.cache.get<BackendClass[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendClass[]>>(`${environment.apiBaseUrl}/api/classes/mine`)
    );
    const data = resp?.data || [];
    
    // Cache for 2 minutes
    this.cache.set(cacheKey, data, 2 * 60 * 1000);
    return data;
  }

  async createClass(payload: { name: string; description?: string }): Promise<BackendClass> {
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<BackendClass>>(`${environment.apiBaseUrl}/api/classes`, payload)
    );
    
    // Clear cache after creating new class
    this.cache.delete('my-teacher-classes');
    
    return resp.data;
  }

  async getClassStudents(classId: string): Promise<BackendClassStudent[]> {
    const cacheKey = `class-students-${classId}`;
    const cached = this.cache.get<BackendClassStudent[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendClassStudent[]>>(
        `${environment.apiBaseUrl}/api/classes/${encodeURIComponent(classId)}/students`
      )
    );
    const data = resp?.data || [];
    
    // Cache for 3 minutes
    this.cache.set(cacheKey, data, 3 * 60 * 1000);
    return data;
  }

  async getClassSummary(classId: string): Promise<BackendClassSummary> {
    const cacheKey = `class-summary-${classId}`;
    const cached = this.cache.get<BackendClassSummary>(cacheKey);
    if (cached) {
      return cached;
    }

    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendClassSummary>>(
        `${environment.apiBaseUrl}/api/classes/${encodeURIComponent(classId)}/summary`
      )
    );
    const data = resp.data;
    
    // Cache for 1 minute (summary data changes frequently)
    this.cache.set(cacheKey, data, 60 * 1000);
    return data;
  }

  // Method to clear cache for specific class
  clearClassCache(classId?: string): void {
    if (classId) {
      this.cache.delete(`class-summary-${classId}`);
      this.cache.delete(`class-students-${classId}`);
    } else {
      this.cache.delete('my-teacher-classes');
    }
  }
}
