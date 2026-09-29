import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { NotificationRealtimeService } from './notification-realtime.service';
import { AuthService } from '../auth/auth.service';

describe('NotificationRealtimeService reconnect', () => {
  it('closes a failed one-time token stream and backs off before requesting a fresh token', fakeAsync(() => {
    const original = globalThis.EventSource;
    const streams: FakeStream[] = [];
    class FakeStream {
      listeners = new Map<string, () => void>();
      closed = false;
      constructor(readonly url: string) { streams.push(this); }
      addEventListener(type: string, listener: () => void) { this.listeners.set(type, listener); }
      close() { this.closed = true; }
      emit(type: string) { this.listeners.get(type)?.(); }
    }
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeStream;
    const fetchSpy = spyOn(globalThis, 'fetch').and.callFake(async () => ({ ok: true,
      json: async () => ({ sseToken: `token-${fetchSpy.calls.count()}` }) }) as Response);
    const service = new NotificationRealtimeService({ getBackendJwt: () => 'jwt' } as AuthService);
    try {
      service.connect(); service.connect();
      flushMicrotasks();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(streams.length).toBe(1);
      streams[0].emit('error');
      expect(streams[0].closed).toBeTrue();
      tick(1_999); flushMicrotasks();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      tick(1); flushMicrotasks();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(streams[1].url).toContain('token-2');
      service.disconnect();
      tick(60_000); flushMicrotasks();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      service.disconnect();
      (globalThis as unknown as { EventSource: unknown }).EventSource = original;
    }
  }));
});
