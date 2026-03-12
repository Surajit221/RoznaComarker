import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import type { BackendClass } from './class-api.service';
import type { RubricDesigner } from '../models/submission-feedback.model';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type BackendAssignment = {
  _id: string;
  title: string;
  writingType?: string;
  instructions?: string;
  rubric?: string;
  rubrics?: any;
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

  private getApiBaseUrl(): string {
    return `${environment.apiUrl}/api`;
  }

  async getClassAssignments(classId: string): Promise<BackendAssignment[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendAssignment[]>>(
        `${apiBaseUrl}/assignments/class/${encodeURIComponent(classId)}`
      )
    );
    return resp?.data || [];
  }

  async createAssignment(payload: {
    title: string;
    classId: string;
    deadline: string;
    writingType: string;
    instructions?: string;
    rubric?: any;
    rubrics?: any;
    allowLateResubmission?: boolean;
  }): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<BackendAssignment>>(`${apiBaseUrl}/assignments`, payload)
    );
    return resp.data;
  }

  async getMyAssignments(): Promise<BackendAssignment[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendAssignment[]>>(`${apiBaseUrl}/assignments/my`)
    );
    return resp?.data || [];
  }

  async getAssignmentById(id: string): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendAssignment>>(`${apiBaseUrl}/assignments/${encodeURIComponent(id)}`)
    );
    return resp.data;
  }

  async getAssignmentByIdForTeacher(id: string): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendAssignment>>(
        `${apiBaseUrl}/assignments/teacher/${encodeURIComponent(id)}`
      )
    );
    return resp.data;
  }

  async updateAssignment(
    id: string,
    payload: {
      title?: string;
      writingType?: string;
      instructions?: string | null;
      rubric?: any;
      rubrics?: any;
      deadline?: string;
      allowLateResubmission?: boolean;
    }
  ): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.patch<BackendResponse<BackendAssignment>>(
        `${apiBaseUrl}/assignments/${encodeURIComponent(id)}`,
        payload
      )
    );
    return resp.data;
  }

  async updateAssignmentRubrics(
    id: string,
    payload: {
      rubrics?: any;
      rubricDesigner?: RubricDesigner | null;
    }
  ): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.patch<BackendResponse<BackendAssignment>>(
        `${apiBaseUrl}/assignments/${encodeURIComponent(id)}/rubrics`,
        payload
      )
    );
    return resp.data;
  }

  async deleteAssignment(id: string): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.delete<BackendResponse<BackendAssignment>>(
        `${apiBaseUrl}/assignments/${encodeURIComponent(id)}`
      )
    );
    return resp.data;
  }

  async generateRubricDesignerFromPrompt(assignmentId: string, prompt: string): Promise<RubricDesigner> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<RubricDesigner>>(
        `${apiBaseUrl}/assignments/${encodeURIComponent(assignmentId)}/generate-rubric-prompt`,
        { prompt }
      )
    );
    return resp.data;
  }

  async uploadRubricFile(assignmentId: string, file: File): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const fd = new FormData();
    fd.append('file', file);
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<BackendAssignment>>(
        `${apiBaseUrl}/assignments/${encodeURIComponent(assignmentId)}/rubric-file`,
        fd
      )
    );
    return resp.data;
  }
}
