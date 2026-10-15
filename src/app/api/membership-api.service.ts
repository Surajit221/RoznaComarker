import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { QR_JOIN_AUTH_RECOVERY } from '../auth/qr-join-context';

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
    return environment.apiUrl;
  }

  async getMyMemberships(refresh = false, context?: HttpContext): Promise<BackendMembership[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    const cacheKey = 'my-memberships';
    const qrOwned = context?.get(QR_JOIN_AUTH_RECOVERY) === true;
    if (qrOwned) this.cache.delete(cacheKey);
    const cached = qrOwned ? null : this.cache.get<BackendMembership[]>(cacheKey);
    if (cached && !refresh) {
      return cached;
    }

    const request = this.http.get<BackendResponse<BackendMembership[]>>(`${apiBaseUrl}/memberships/mine`, { context });
    const resp = await firstValueFrom(context?.get(QR_JOIN_AUTH_RECOVERY) ? request.pipe(timeout(30_000)) : request);
    const data = resp?.data || [];
    
    // Cache for 2 minutes
    // A QR read may finish after navigation/account changes. Do not publish
    // its result into the shared class-list cache.
    if (!qrOwned) this.cache.set(cacheKey, data, 2 * 60 * 1000);
    return data;
  }

  async joinClassByCode(joinCode: string, context?: HttpContext): Promise<JoinClassResponse> {
    const apiBaseUrl = this.getApiBaseUrl();
    const request = this.http.post<BackendResponse<JoinClassResponse>>(`${apiBaseUrl}/memberships/join`, { joinCode }, { context });
    const resp = await firstValueFrom(context?.get(QR_JOIN_AUTH_RECOVERY) ? request.pipe(timeout(30_000)) : request);
    
    // Clear memberships cache after joining new class
    this.cache.delete('my-memberships');
    
    return resp.data;
  }
}
