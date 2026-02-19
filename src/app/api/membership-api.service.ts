import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { CacheService } from '../services/cache.service';
import type { BackendClass } from './class-api.service';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type BackendTeacher = {
  _id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: string;
};

export type BackendMembership = {
  student: string;
  class: BackendClass & { teacher?: BackendTeacher };
  joinedAt?: string;
  status: 'active' | 'left';
};

export type JoinClassResponse = {
  membership: BackendMembership;
  class: BackendClass & { teacher?: BackendTeacher };
};

@Injectable({ providedIn: 'root' })
export class MembershipApiService {
  constructor(
    private http: HttpClient,
    private cache: CacheService
  ) {}

  private getApiBaseUrl(): string {
    return `${environment.apiUrl}/api`;
  }

  async getMyMemberships(): Promise<BackendMembership[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    const cacheKey = 'my-memberships';
    const cached = this.cache.get<BackendMembership[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendMembership[]>>(`${apiBaseUrl}/memberships/mine`)
    );
    const data = resp?.data || [];
    
    // Cache for 2 minutes
    this.cache.set(cacheKey, data, 2 * 60 * 1000);
    return data;
  }

  async joinClassByCode(joinCode: string): Promise<JoinClassResponse> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<JoinClassResponse>>(`${apiBaseUrl}/memberships/join`, { joinCode })
    );
    
    // Clear memberships cache after joining new class
    this.cache.delete('my-memberships');
    
    return resp.data;
  }
}
