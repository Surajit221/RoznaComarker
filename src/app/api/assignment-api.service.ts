import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import type { BackendClass } from './class-api.service';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type BackendAssignment = {
  _id: string;
  title: string;
  instructions?: string;
  rubric?: string;
  deadline: string;
  class: BackendClass | string;
  teacher: any;
  qrToken: string;
  allowLateResubmission?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable({ providedIn: 'root' })
export class AssignmentApiService {
  constructor(private http: HttpClient) {}

  async getClassAssignments(classId: string): Promise<BackendAssignment[]> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendAssignment[]>>(
        `${apiBaseUrl}/api/assignments/class/${encodeURIComponent(classId)}`
      )
    );
    return resp?.data || [];
  }

  async createAssignment(payload: {
    title: string;
    classId: string;
    deadline: string;
    instructions?: string;
    rubric?: any;
    allowLateResubmission?: boolean;
  }): Promise<BackendAssignment> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<BackendAssignment>>(`${apiBaseUrl}/api/assignments`, payload)
    );
    return resp.data;
  }

  async getMyAssignments(): Promise<BackendAssignment[]> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendAssignment[]>>(`${apiBaseUrl}/api/assignments/my`)
    );
    return resp?.data || [];
  }

  async getAssignmentById(id: string): Promise<BackendAssignment> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendAssignment>>(`${apiBaseUrl}/api/assignments/${encodeURIComponent(id)}`)
    );
    return resp.data;
  }
}
