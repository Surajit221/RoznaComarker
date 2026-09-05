import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
type Response<T> = { success: boolean; data: T };
export type InstitutionContext = { id: string; name: string; status: string; role: string; managedByInstitution: boolean;
  sharedCreditRemaining: number; myUsage: number; myLimit: number | null; cycleStart: string; cycleEnd: string };
export type InstitutionDashboard = { institution: { id: string; name: string; status: string; plan: unknown };
  seats: { used: number; limit: number | null }; credits: { monthly: number; used: number; remaining: number; cycleStart: string; cycleEnd: string };
  teachers: Array<{ memberId: string; userId: string; name: string; email: string; role: string; creditsUsed: number; limit: number | null }>;
  classes: Array<{ _id: string; name: string; status: string }> };
@Injectable({ providedIn: 'root' })
export class InstitutionApiService {
  constructor(private http: HttpClient) {}
  async getMine(): Promise<InstitutionContext | null> { return (await firstValueFrom(this.http.get<Response<InstitutionContext | null>>(`${environment.apiUrl}/institutions/me`))).data; }
  async dashboard(): Promise<InstitutionDashboard> { return (await firstValueFrom(this.http.get<Response<InstitutionDashboard>>(`${environment.apiUrl}/institutions/me/dashboard`))).data; }
  async invite(email: string, role: string): Promise<{ expiresAt?: string }> { return (await firstValueFrom(this.http.post<Response<{ expiresAt?: string }>>(`${environment.apiUrl}/institutions/me/invites`, { email, role }))).data; }
  async updateMember(memberId: string, monthlyCreditLimit: number | null): Promise<void> { await firstValueFrom(this.http.patch(`${environment.apiUrl}/institutions/me/members/${encodeURIComponent(memberId)}`, { monthlyCreditLimit })); }
  async removeMember(memberId: string): Promise<void> { await firstValueFrom(this.http.delete(`${environment.apiUrl}/institutions/me/members/${encodeURIComponent(memberId)}`)); }
  async accept(token: string): Promise<{ institutionId: string; institutionName?: string }> { return (await firstValueFrom(this.http.post<Response<{ institutionId: string; institutionName?: string }>>(`${environment.apiUrl}/institutions/invites/${encodeURIComponent(token)}/accept`, {}))).data; }
}
