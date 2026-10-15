import { Injectable, inject } from '@angular/core';
import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';
import { QR_JOIN_AUTH_RECOVERY, qrDiagnostic } from '../auth/qr-join-context';
import { MembershipApiService } from '../api/membership-api.service';
import { JoinIntent, JoinIntentService } from './join-intent.service';

export type QrJoinResult = { state: 'joined'; classId: string | null }
  | { state: 'login' | 'verification' | 'role' | 'wrong-role' };

@Injectable({ providedIn: 'root' })
export class QrClassJoinService {
  private runs = new Map<string, Promise<QrJoinResult>>();
  private readonly context = new HttpContext().set(QR_JOIN_AUTH_RECOVERY, true);
  private auth = inject(AuthService);
  private membership = inject(MembershipApiService);
  private intents = inject(JoinIntentService);

  async run(url: string): Promise<QrJoinResult> {
    const intent = this.intents.captureUrl(url);
    if (!intent) throw new Error('This link is missing a valid join code.');
    const session = await this.auth.ensureQrBackendSession();
    if (session.state !== 'ready') return { state: session.state === 'verification' ? 'verification' : 'login' };
    if (!session.role) return { state: 'role' };
    if (session.role !== 'student') return { state: 'wrong-role' };
    const key = JSON.stringify([session.uid, intent.joinCode]);
    const existing = this.runs.get(key);
    if (existing) return existing.then(result => {
      if (!this.auth.isQrSessionCurrent(session.uid)) throw new Error('QR authentication changed');
      if (result.state === 'joined') this.intents.complete(intent);
      return result;
    });
    const run = this.join(intent, session.uid).catch(error => {
      qrDiagnostic('qr_join_failed'); throw error;
    }).finally(() => { this.runs.delete(key); });
    this.runs.set(key, run);
    return run;
  }

  private async joinedClassId(joinCode: string): Promise<string | null> {
    const memberships = await this.membership.getMyMemberships(true, this.context);
    return memberships.find(m => m.status === 'active'
      && m.class?.joinCode?.toUpperCase() === joinCode.toUpperCase())?.class?._id || null;
  }

  private async join(intent: JoinIntent, uid: string): Promise<QrJoinResult> {
    // A fresh membership read avoids replaying a POST after Back/Refresh or
    // another scan of a class the student has already joined.
    try {
      const classId = await this.joinedClassId(intent.joinCode);
      if (classId && this.auth.isQrSessionCurrent(uid)) {
        this.intents.complete(intent); qrDiagnostic('qr_already_joined');
        return { state: 'joined', classId };
      }
    } catch { /* The join endpoint remains authoritative if this read fails. */ }
    qrDiagnostic('qr_join_started');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!this.auth.isQrSessionCurrent(uid)) throw new Error('QR authentication changed');
        const response = await this.membership.joinClassByCode(intent.joinCode, this.context);
        if (!this.auth.isQrSessionCurrent(uid)) throw new Error('QR authentication changed');
        const classId = response?.class?._id || response?.membership?.class?._id;
        if (!classId || typeof classId !== 'string') throw new Error('Invalid join response');
        this.intents.complete(intent); qrDiagnostic('qr_join_succeeded');
        return { state: 'joined', classId };
      } catch (error: unknown) {
        if (error instanceof HttpErrorResponse && error.status === 409 && error.error?.code === 'ALREADY_JOINED') {
          if (!this.auth.isQrSessionCurrent(uid)) throw error;
          let classId: string | null = null;
          try {
            classId = await this.joinedClassId(intent.joinCode);
          } catch { /* Already joined is success; fall back to the authorized class list. */ }
          if (!this.auth.isQrSessionCurrent(uid)) throw error;
          this.intents.complete(intent); qrDiagnostic('qr_already_joined');
          return { state: 'joined', classId };
        }
        if (error instanceof HttpErrorResponse && error.status === 401 && attempt === 0) {
          qrDiagnostic('qr_join_auth_retry');
          const refreshed = await this.auth.ensureQrBackendSession(true);
          if (refreshed.state !== 'ready' || refreshed.uid !== uid || refreshed.role !== 'student') throw error;
          continue;
        }
        // A timeout/disconnection can lose the response after the server has
        // committed membership. Confirm that state without replaying a POST.
        if ((error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500))
          || (error instanceof Error && error.name === 'TimeoutError')) {
          try {
            const classId = await this.joinedClassId(intent.joinCode);
            if (classId && this.auth.isQrSessionCurrent(uid)) {
              this.intents.complete(intent); qrDiagnostic('qr_already_joined');
              return { state: 'joined', classId };
            }
          } catch { /* Preserve the original failure and pending intent. */ }
        }
        if (error instanceof HttpErrorResponse && ['INVALID_JOIN_CODE', 'JOIN_CODE_EXPIRED'].includes(error.error?.code))
          this.intents.complete(intent);
        throw error;
      }
    }
    throw new Error('Unable to authenticate the class join.');
  }
}
