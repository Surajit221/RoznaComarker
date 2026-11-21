import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type { BackendAssignment } from './assignment-api.service';

/** GET /api/audio/config (teacher). { enabled: false } while the backend feature is off (it answers 404) or the call fails. */
export interface AudioConfig {
  enabled: boolean;
  maxFileBytes?: number;
  maxDurationSeconds?: number;
  minDurationSeconds?: number;
  dailyMinutesPerTeacher?: number;
  monthlyMinutesPerTeacher?: number;
}

export interface SpeakingAssignmentInput {
  classId: string;
  title: string;
  instructions: string;
  deadline: string;
  showMarksToStudent: boolean;
  maxRecordingSeconds: number;
  rubricRef: string | null;
}
export type SpeakingAssignmentUpdate = Omit<SpeakingAssignmentInput, 'classId' | 'rubricRef'>;

interface Envelope<T> { success: boolean; data: T }

/** Speaking assignments (audio + speech-to-text). Errors are passed on as they come; callers show fixed text (utils/speaking-messages). */
@Injectable({ providedIn: 'root' })
export class SpeakingApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  async getAudioConfig(): Promise<AudioConfig> {
    try {
      const response = await firstValueFrom(this.http.get<Envelope<AudioConfig>>(`${this.base}/audio/config`));
      return response?.data?.enabled === true ? response.data : { enabled: false };
    } catch {
      return { enabled: false };
    }
  }

  async createSpeakingAssignment(input: SpeakingAssignmentInput): Promise<BackendAssignment> {
    const { maxRecordingSeconds, rubricRef, ...rest } = input;
    const response = await firstValueFrom(this.http.post<Envelope<BackendAssignment>>(`${this.base}/assignments`,
      { ...rest, resourceType: 'speaking', speaking: { maxRecordingSeconds, rubricRef } }));
    return response.data;
  }

  async updateSpeakingAssignment(id: string, input: SpeakingAssignmentUpdate): Promise<BackendAssignment> {
    const { maxRecordingSeconds, ...rest } = input;
    const response = await firstValueFrom(this.http.patch<Envelope<BackendAssignment>>(`${this.base}/assignments/${encodeURIComponent(id)}`,
      { ...rest, speaking: { maxRecordingSeconds } }));
    return response.data;
  }

  /** Points the assignment at a saved rubric (the copy made for it). Only the rubric reference changes. */
  async attachRubric(id: string, rubricRef: string): Promise<BackendAssignment> {
    const response = await firstValueFrom(this.http.patch<Envelope<BackendAssignment>>(`${this.base}/assignments/${encodeURIComponent(id)}`,
      { speaking: { rubricRef } }));
    return response.data;
  }
}
