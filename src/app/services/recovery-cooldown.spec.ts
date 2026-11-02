import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { DEFAULT_RECOVERY_COOLDOWN_SECONDS, RecoveryCooldown, recoveryRequestError } from './recovery-cooldown';

describe('RecoveryCooldown', () => {
  beforeEach(() => { jasmine.clock().install(); jasmine.clock().mockDate(new Date(2026, 10, 2, 9, 0, 0)); });
  afterEach(() => jasmine.clock().uninstall());

  it('counts down every second, labels m:ss and ends by itself', () => {
    const cooldown = new RecoveryCooldown();
    cooldown.start(65);
    expect([cooldown.active, cooldown.label]).toEqual([true, '1:05']);
    jasmine.clock().tick(5000);
    expect(cooldown.label).toBe('1:00');
    jasmine.clock().tick(60000);
    expect([cooldown.active, cooldown.remaining()]).toEqual([false, 0]);
  });
  it('uses the default for a missing or unreasonable value', () => {
    const cooldown = new RecoveryCooldown();
    for (const bad of [undefined, null, 0, -5, Number.NaN, 99999, '120']) {
      cooldown.start(bad);
      expect(cooldown.remaining()).withContext(String(bad)).toBe(DEFAULT_RECOVERY_COOLDOWN_SECONDS);
    }
    cooldown.stop();
  });
});

describe('recoveryRequestError', () => {
  const error = (status: number, headers?: Record<string, string>) => new HttpErrorResponse({ status, headers: new HttpHeaders(headers) });
  it('rate limits wait (Retry-After or 5 minutes); bad input and network errors are honest and start no countdown', () => {
    const cooldown = new RecoveryCooldown();
    expect(recoveryRequestError(error(429, { 'Retry-After': '42' }), cooldown)).toContain('Too many requests');
    expect(cooldown.remaining()).toBe(42);
    recoveryRequestError(error(429), cooldown);
    expect(cooldown.remaining()).toBe(300);
    cooldown.stop();
    expect(recoveryRequestError(error(400), cooldown)).toContain('email address');
    expect(recoveryRequestError(error(0), cooldown)).toContain('could not send');
    expect(cooldown.active).toBeFalse();
  });
});
