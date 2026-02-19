import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Auth, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signOut } from '@angular/fire/auth';

import { environment } from '../../environments/environment';

type BackendLoginResponse = {
  success: boolean;
  token: string;
  user?: {
    id: string;
    email: string;
    role: string;
  };
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
  role: string;
};

export type BackendUser = {
  _id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role?: string;
};

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly backendJwtKey = 'backend_jwt';

  constructor(private auth: Auth, private http: HttpClient) {}

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

  async loginWithEmail(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    const token = await cred.user.getIdToken();
    if (!token) {
      throw new Error('Failed to get Firebase ID token');
    }
    const resp = await this.exchangeWithBackend(token);
    this.persistBackendSession(resp);
    return resp;
  }

  async signupWithEmail(email: string, password: string) {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    const token = await cred.user.getIdToken();
    if (!token) {
      throw new Error('Failed to get Firebase ID token');
    }
    const resp = await this.exchangeWithBackend(token);
    this.persistBackendSession(resp);
    return resp;
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(this.auth, provider);
    const token = await cred.user.getIdToken();
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
    localStorage.removeItem(this.backendJwtKey);
    await signOut(this.auth);
  }

  getBackendJwt(): string | null {
    return localStorage.getItem(this.backendJwtKey);
  }

  getBackendRole(): string | null {
    const token = this.getBackendJwt();
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    const role = payload && payload.role;
    return typeof role === 'string' ? role : null;
  }

  async getMeProfile(): Promise<BackendMe> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<BackendMe>>(`${apiBaseUrl}/users/me`)
      );
      return resp.data;
    } catch (err: unknown) {
      this.logHttpError('getMeProfile', err);
      throw err;
    }
  }

  async getUserById(userId: string): Promise<BackendUser> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<BackendUser>>(`${apiBaseUrl}/users/${encodeURIComponent(userId)}`)
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
