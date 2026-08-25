import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Auth, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from '@angular/fire/auth';

import { environment } from '../../environments/environment';
import { clearPrivateAuthStorage, decodeBackendJwt, readUsableBackendJwt } from './backend-token.util';

type BackendLoginResponse = {
  success: boolean;
  token: string;
  user?: {
    id: string;
    email: string;
    role: string | null;
  };
};

export type VerificationRequired = {
  verificationRequired: true;
  email: string;
};

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type BackendMe = {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  institution?: string;
  bio?: string;
  aiConfig?: {
    strictness?: 'friendly' | 'balanced' | 'strict' | string;
    checks?: {
      grammarSpelling?: boolean;
      coherenceLogic?: boolean;
      factChecking?: boolean;
    };
  };
  classroomDefaults?: {
    gradingScale?: 'score_0_100' | 'grade_a_f' | 'pass_fail' | string;
    lateSubmissionPenaltyPercent?: number;
    autoPublishGrades?: boolean;
  };
  evaluationPropagation?: {
    status: 'completed' | 'pending';
    policyHash: string;
  };
  role: string | null;
};

export type BackendUser = {
  _id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  institution?: string;
  bio?: string;
  role?: string;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly backendJwtKey = 'backend_jwt';
  private readonly injector = inject(EnvironmentInjector);

  constructor(private auth: Auth, private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return environment.apiUrl;
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

  async loginWithEmail(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    await cred.user.reload();
    if (!cred.user.emailVerified) {
      clearPrivateAuthStorage();
      return { verificationRequired: true, email: cred.user.email || email } as VerificationRequired;
    }
    const token = await cred.user.getIdToken(true);
    if (!token) {
      throw new Error('Failed to get Firebase ID token');
    }
    const resp = await this.exchangeWithBackend(token);
    this.persistBackendSession(resp);
    return resp;
  }

  async signupWithEmail(email: string, password: string) {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    clearPrivateAuthStorage();
    await this.requestVerificationDelivery(await cred.user.getIdToken(true));
    return { verificationRequired: true, email: cred.user.email || email } as VerificationRequired;
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.getApiBaseUrl()}/auth/request-password-reset`, {
      email: email.trim().toLowerCase()
    }));
  }

  async resendVerificationEmail(): Promise<string> {
    await this.auth.authStateReady();
    const user = this.auth.currentUser;
    if (!user) throw Object.assign(new Error('Authentication is required'), { code: 'auth/no-current-user' });
    await user.reload();
    if (!user.emailVerified) await this.requestVerificationDelivery(await user.getIdToken(true));
    return user.email || '';
  }

  async completeEmailVerification(): Promise<BackendLoginResponse | null> {
    await this.auth.authStateReady();
    const user = this.auth.currentUser;
    if (!user) throw Object.assign(new Error('Authentication is required'), { code: 'auth/no-current-user' });
    await user.reload();
    if (!user.emailVerified) return null;
    const token = await user.getIdToken(true);
    const response = await this.exchangeWithBackend(token);
    this.persistBackendSession(response);
    return response;
  }

  async pendingVerificationEmail(): Promise<string | null> {
    await this.auth.authStateReady();
    return this.auth.currentUser?.email || null;
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await runInInjectionContext(this.injector, () => signInWithPopup(this.auth, provider));
    const token = await cred.user.getIdToken(true);
    if (!token) {
      throw new Error('Failed to get Firebase ID token');
    }
    const resp = await this.exchangeWithBackend(token);
    this.persistBackendSession(resp);
    return resp;
  }

  async startGoogleRedirect() {
    const provider = new GoogleAuthProvider();
    await runInInjectionContext(this.injector, () => signInWithRedirect(this.auth, provider));
  }

  async completeGoogleRedirectIfPresent() {
    const result = await runInInjectionContext(this.injector, () => getRedirectResult(this.auth));
    if (!result?.user) return null;

    const token = await result.user.getIdToken(true);
    if (!token) {
      throw new Error('Failed to get Firebase ID token');
    }
    const resp = await this.exchangeWithBackend(token);
    this.persistBackendSession(resp);
    return resp;
  }

  async setMyRole(role: 'teacher' | 'student') {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.patch<BackendLoginResponse>(
        `${apiBaseUrl}/users/me/role`,
        { role },
        {
          headers: {
            Authorization: `Bearer ${this.getBackendJwt() || ''}`
          }
        }
      )
    );

    this.persistBackendSession(resp);
    return resp;
  }

  async logout() {
    clearPrivateAuthStorage();
    try {
      await runInInjectionContext(this.injector, () => signOut(this.auth));
    } finally {
      clearPrivateAuthStorage();
    }
  }

  getBackendJwt(): string | null {
    return readUsableBackendJwt();
  }

  private buildBackendAuthHeaders(): { Authorization: string } | undefined {
    const token = this.getBackendJwt();
    if (!token) return undefined;
    return {
      Authorization: `Bearer ${token}`
    };
  }

  getBackendRole(): string | null {
    const token = this.getBackendJwt();
    if (!token) return null;
    const payload = decodeBackendJwt(token);
    const role = payload && payload.role;
    return typeof role === 'string' ? role : null;
  }

  async getMeProfile(): Promise<BackendMe> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<BackendMe>>(`${apiBaseUrl}/users/me`, {
          headers: this.buildBackendAuthHeaders()
        })
      );
      return resp.data;
    } catch (err: unknown) {
      this.logHttpError('getMeProfile', err);
      throw err;
    }
  }

  async updateMeProfile(payload: {
    displayName?: string;
    institution?: string;
    bio?: string;
    aiConfig?: BackendMe['aiConfig'];
    classroomDefaults?: BackendMe['classroomDefaults'];
  }): Promise<BackendMe> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.patch<BackendResponse<BackendMe>>(`${apiBaseUrl}/users/me`, payload, {
          headers: this.buildBackendAuthHeaders()
        })
      );
      return resp.data;
    } catch (err: unknown) {
      this.logHttpError('updateMeProfile', err);
      throw err;
    }
  }

  async uploadMyAvatar(file: File): Promise<{ photoURL: string }> {
    const apiBaseUrl = this.getApiBaseUrl();
    const formData = new FormData();
    formData.append('file', file);

    try {
      const resp = await firstValueFrom(
        this.http.post<BackendResponse<{ photoURL: string }>>(`${apiBaseUrl}/users/me/avatar`, formData, {
          headers: this.buildBackendAuthHeaders()
        })
      );
      return resp.data;
    } catch (err: unknown) {
      this.logHttpError('uploadMyAvatar', err);
      throw err;
    }
  }

  async getUserById(userId: string): Promise<BackendUser> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<BackendUser>>(`${apiBaseUrl}/users/${encodeURIComponent(userId)}`, {
          headers: this.buildBackendAuthHeaders()
        })
      );
      return resp.data;
    } catch (err: unknown) {
      this.logHttpError('getUserById', err);
      throw err;
    }
  }

  private persistBackendSession(resp: BackendLoginResponse | null | undefined) {
    if (resp?.token) {
      localStorage.setItem(this.backendJwtKey, resp.token);
    }
  }

  private async requestVerificationDelivery(firebaseToken: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.getApiBaseUrl()}/auth/send-verification-email`, {}, {
      headers: { Authorization: `Bearer ${firebaseToken}` }
    }));
  }

  private async exchangeWithBackend(firebaseToken: string): Promise<BackendLoginResponse> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.post<BackendLoginResponse>(
          `${apiBaseUrl}/auth/login`,
          {},
          {
            headers: {
              Authorization: `Bearer ${firebaseToken}`
            }
          }
        )
      );
      return resp;
    } catch (err: unknown) {
      this.logHttpError('exchangeWithBackend', err);
      throw err;
    }
  }
}
