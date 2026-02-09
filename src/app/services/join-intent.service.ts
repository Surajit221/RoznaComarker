import { Injectable } from '@angular/core';

export type JoinIntent = {
  type: 'JOIN_CLASS';
  joinCode: string;
  createdAt: number;
};

@Injectable({ providedIn: 'root' })
export class JoinIntentService {
  private readonly storageKey = 'join_intent';
  private readonly maxAgeMs = 24 * 60 * 60 * 1000;

  setJoinClassIntent(joinCode: string) {
    const safeJoinCode = (joinCode || '').trim();
    if (!safeJoinCode) return;

    const payload: JoinIntent = {
      type: 'JOIN_CLASS',
      joinCode: safeJoinCode,
      createdAt: Date.now(),
    };

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }

  peek(): JoinIntent | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<JoinIntent>;

      if (parsed.type !== 'JOIN_CLASS') return null;
      if (!parsed.joinCode || typeof parsed.joinCode !== 'string') return null;
      if (!parsed.createdAt || typeof parsed.createdAt !== 'number') return null;

      const age = Date.now() - parsed.createdAt;
      if (!Number.isFinite(age) || age < 0 || age > this.maxAgeMs) {
        return null;
      }

      return parsed as JoinIntent;
    } catch {
      return null;
    }
  }

  consume(): JoinIntent | null {
    const intent = this.peek();
    this.clear();
    return intent;
  }

  clear() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // ignore
    }
  }
}
