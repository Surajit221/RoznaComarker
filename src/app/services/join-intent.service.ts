import { Injectable } from '@angular/core';
import { readStorage, removeStorage, writeStorage } from '../auth/safe-browser-storage';
import { isQrJoinUrl } from '../auth/safe-return-url';
import { qrDiagnostic } from '../auth/qr-join-context';

export type JoinIntent = { type: 'JOIN_CLASS'; joinCode: string; createdAt: number; returnUrl?: string };

@Injectable({ providedIn: 'root' })
export class JoinIntentService {
  private readonly storageKey = 'join_intent';
  private readonly maxAgeMs = 24 * 60 * 60 * 1000;

  setJoinClassIntent(joinCode: string, returnUrl?: string): JoinIntent | null {
    const code = (joinCode || '').trim();
    if (!code) return null;
    const url = isQrJoinUrl(returnUrl) && new URL(returnUrl, 'https://internal.invalid').searchParams.get('joinCode')?.trim() === code
      ? returnUrl : '/student/join-class?joinCode=' + encodeURIComponent(code);
    const previous = this.peek();
    if (previous?.joinCode === code && previous.returnUrl === url) return previous;
    const intent: JoinIntent = { type: 'JOIN_CLASS', joinCode: code, createdAt: Date.now(), returnUrl: url };
    writeStorage(this.storageKey, JSON.stringify(intent));
    qrDiagnostic('qr_intent_created');
    return intent;
  }

  captureUrl(url: string): JoinIntent | null {
    if (!isQrJoinUrl(url)) return null;
    const code = new URL(url, 'https://internal.invalid').searchParams.get('joinCode')?.trim();
    return code ? this.setJoinClassIntent(code, url) : null;
  }

  peek(): JoinIntent | null {
    try {
      const raw = readStorage(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<JoinIntent>;
      const age = Date.now() - Number(parsed.createdAt);
      if (parsed.type !== 'JOIN_CLASS' || typeof parsed.joinCode !== 'string' || !parsed.joinCode.trim()
        || typeof parsed.createdAt !== 'number' || !Number.isFinite(age) || age < 0 || age > this.maxAgeMs
        || (parsed.returnUrl !== undefined && (!isQrJoinUrl(parsed.returnUrl)
          || new URL(parsed.returnUrl, 'https://internal.invalid').searchParams.get('joinCode')?.trim() !== parsed.joinCode.trim()))) {
        this.clear(); return null;
      }
      return parsed as JoinIntent;
    } catch { this.clear(); return null; }
  }

  complete(intent: JoinIntent): void {
    const current = this.peek();
    if (current?.joinCode === intent.joinCode && current.createdAt === intent.createdAt
      && current.returnUrl === intent.returnUrl) { this.clear(); qrDiagnostic('qr_intent_consumed'); }
  }

  consume(): JoinIntent | null { const intent = this.peek(); this.clear(); return intent; }
  clear(): void {
    removeStorage(this.storageKey);
    if (isQrJoinUrl(readStorage('post_login_redirect'))) removeStorage('post_login_redirect');
  }
}
