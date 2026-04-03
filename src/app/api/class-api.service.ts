import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';

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
  subjectLevel?: string;
  startDate?: string | null;
  endDate?: string | null;
  bannerUrl?: string;
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
  subjectLevel?: string;
  startDate?: string | null;
  endDate?: string | null;
  bannerUrl?: string;
  joinCode: string;
  gradingScale?: 'score_0_100' | 'grade_a_f' | 'pass_fail' | string;
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
  private readonly classUpdatedSubject = new Subject<BackendClass>();
  readonly classUpdated$ = this.classUpdatedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private cache: CacheService
  ) {}

  private getApiBaseUrl(): string {
    return `${environment.apiUrl}/api`;
  }

  private resolvePublicUrl(raw?: string | null): string {
    const u = String(raw || '').trim();
    if (!u) return '';

    if (
      u.startsWith('http://') ||
      u.startsWith('https://') ||
      u.startsWith('blob:') ||
      u.startsWith('data:')
    ) {
      return u;
    }

    const base = String(environment.apiUrl || '').trim().replace(/\/+$/, '');
    if (!base) return u;

    if (u.startsWith('/')) return `${base}${u}`;
    return `${base}/${u}`;
  }

  private resolveBannerInClass(c: BackendClass): BackendClass {
    if (!c) return c;
    return {
      ...c,
      bannerUrl: this.resolvePublicUrl(c.bannerUrl)
    };
  }

  private resolveBannerInSummary(s: BackendClassSummary): BackendClassSummary {
    if (!s) return s;
    return {
      ...s,
      bannerUrl: this.resolvePublicUrl(s.bannerUrl)
    };
  }

  async getMyTeacherClasses(): Promise<BackendClass[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    const cacheKey = 'my-teacher-classes';
    const cached = this.cache.get<BackendClass[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendClass[]>>(`${apiBaseUrl}/classes/mine`)
    );
    const data = (resp?.data || []).map((c) => this.resolveBannerInClass(c));
    
    // Cache for 2 minutes
    this.cache.set(cacheKey, data, 2 * 60 * 1000);
    return data;
  }

  async getClasses(): Promise<BackendClass[]> {
    return this.getMyTeacherClasses();
  }

  async createClass(payload: {
    name: string;
    description?: string;
    subjectLevel?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }): Promise<BackendClass> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<BackendClass>>(`${apiBaseUrl}/classes`, payload)
    );
    
    // Clear cache after creating new class
    this.cache.delete('my-teacher-classes');

    if (resp?.data) {
      this.classUpdatedSubject.next(this.resolveBannerInClass(resp.data));
    }
    
    return this.resolveBannerInClass(resp.data);
  }

  async updateClass(
    classId: string,
    payload: {
      name?: string;
      description?: string | null;
      subjectLevel?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    }
  ): Promise<BackendClass> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.put<BackendResponse<BackendClass>>(
        `${apiBaseUrl}/classes/${encodeURIComponent(classId)}`,
        payload
      )
    );

    this.clearClassCache(classId);
    this.cache.delete('my-teacher-classes');
    if (resp?.data) {
      this.classUpdatedSubject.next(this.resolveBannerInClass(resp.data));
    }
    return this.resolveBannerInClass(resp.data);
  }

  async uploadClassBanner(
    classId: string,
    file: File
  ): Promise<{ fileUrl: string; fileName: string }> {
    const apiBaseUrl = this.getApiBaseUrl();

    const formData = new FormData();
    formData.append('file', file);

    const resp = await firstValueFrom(
      this.http.post<{ success: boolean; fileUrl: string; fileName: string; message?: string }>(
        `${apiBaseUrl}/classes/${encodeURIComponent(classId)}/banner`,
        formData
      )
    );

    if (!resp?.success || !resp?.fileUrl) {
      throw new Error(resp?.message || 'Banner upload failed');
    }

    return { fileUrl: resp.fileUrl, fileName: resp.fileName };
  }

  async uploadBanner(classId: string, file: File): Promise<{ fileUrl: string; fileName: string }> {
    return this.uploadClassBanner(classId, file);
  }

  async deleteClass(classId: string): Promise<BackendClass> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.delete<BackendResponse<BackendClass>>(
        `${apiBaseUrl}/classes/${encodeURIComponent(classId)}`
      )
    );

    this.clearClassCache(classId);
    this.cache.delete('my-teacher-classes');
    return resp.data;
  }

  async getClassStudents(
    classId: string,
    options?: { forceRefresh?: boolean }
  ): Promise<BackendClassStudent[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    const cacheKey = `class-students-${classId}`;

    if (!options?.forceRefresh) {
      const cached = this.cache.get<BackendClassStudent[]>(cacheKey);
      if (cached) {
        return cached;
      }
    } else {
      this.cache.delete(cacheKey);
    }

    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendClassStudent[]>>(
        `${apiBaseUrl}/classes/${encodeURIComponent(classId)}/students`
      )
    );
    const data = resp?.data || [];

    // Cache for 3 minutes
    this.cache.set(cacheKey, data, 3 * 60 * 1000);
    return data;
  }

  async removeStudentFromClass(classId: string, studentId: string): Promise<void> {
    const apiBaseUrl = this.getApiBaseUrl();
    await firstValueFrom(
      this.http.delete<BackendResponse<any>>(
        `${apiBaseUrl}/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`
      )
    );

    this.clearClassCache(classId);
    this.cache.delete('my-teacher-classes');
  }

  async getClassSummary(classId: string, options?: { forceRefresh?: boolean }): Promise<BackendClassSummary> {
    const apiBaseUrl = this.getApiBaseUrl();
    const cacheKey = `class-summary-${classId}`;
    if (!options?.forceRefresh) {
      const cached = this.cache.get<BackendClassSummary>(cacheKey);
      if (cached) {
        return cached;
      }
    } else {
      this.cache.delete(cacheKey);
    }

    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendClassSummary>>(
        `${apiBaseUrl}/classes/${encodeURIComponent(classId)}/summary`
      )
    );
    const data = this.resolveBannerInSummary(resp.data);
    
    // Cache for 1 minute (summary data changes frequently)
    this.cache.set(cacheKey, data, 60 * 1000);
    return data;
  }

  invalidateClassStudents(classId: string): void {
    this.cache.delete(`class-students-${classId}`);
  }

  invalidateClassSummary(classId: string): void {
    this.cache.delete(`class-summary-${classId}`);
  }

  invalidateTeacherClassesList(): void {
    this.cache.delete('my-teacher-classes');
  }

  invalidateAllClassSummaries(): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith('class-summary-')) {
        this.cache.delete(key);
      }
    }
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

  async inviteStudents(classId: string, emails: string[]): Promise<{
    classId: string;
    className: string;
    results: Array<{
      email: string;
      status: 'invited' | 'already_joined' | 'already_invited' | 'error';
      message: string;
      invitationId?: string;
      token?: string;
      joinUrl?: string;
      joinCode?: string;
      expiresAt?: string;
    }>;
    summary: {
      total: number;
      invited: number;
      already_joined: number;
      already_invited: number;
      errors: number;
    };
  }> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<any>>(`${apiBaseUrl}/classes/${encodeURIComponent(classId)}/invite`, {
        emails
      })
    );
    
    // Clear relevant caches after inviting
    this.invalidateClassStudents(classId);
    this.invalidateClassSummary(classId);
    
    return resp.data;
  }

  async getClassInvitations(classId: string): Promise<Array<{
    email: string;
    status: 'pending' | 'accepted' | 'expired';
    invitedAt: string;
    expiresAt: string;
    acceptedAt?: string;
    token: string;
  }>> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<any[]>>(`${apiBaseUrl}/classes/${encodeURIComponent(classId)}/invitations`)
    );
    return resp.data || [];
  }
}
