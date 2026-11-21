import { TestBed } from '@angular/core/testing';
import { AudioConfigService } from './audio-config.service';
import { SpeakingApiService } from '../api/speaking-api.service';

describe('AudioConfigService', () => {
  const setup = (result: unknown) => {
    const getAudioConfig = jasmine.createSpy('getAudioConfig').and.resolveTo(result);
    TestBed.configureTestingModule({ providers: [{ provide: SpeakingApiService, useValue: { getAudioConfig } }] });
    return { service: TestBed.inject(AudioConfigService), getAudioConfig };
  };

  it('off until loaded; loads once; exposes the policy maximum in whole minutes (7 by default)', async () => {
    const { service, getAudioConfig } = setup({ enabled: true, maxFileBytes: 41943040, maxDurationSeconds: 420, minDurationSeconds: 5 });
    expect(service.enabled()).toBeFalse();
    await Promise.all([service.load(), service.load()]);
    expect(getAudioConfig).toHaveBeenCalledTimes(1);
    expect(service.enabled()).toBeTrue();
    expect(service.maxMinutes()).toBe(7);
  });

  it('a policy maximum that is not whole minutes rounds down; never below 1', async () => {
    const { service } = setup({ enabled: true, maxDurationSeconds: 150 });
    await service.load();
    expect(service.maxMinutes()).toBe(2);
  });

  it('a policy maximum under one minute still offers 1 minute', async () => {
    const { service } = setup({ enabled: true, maxDurationSeconds: 30 });
    await service.load();
    expect(service.maxMinutes()).toBe(1);
  });

  it('feature off: stays off', async () => {
    const { service } = setup({ enabled: false });
    await service.load();
    expect(service.enabled()).toBeFalse();
    expect(service.maxMinutes()).toBe(7);
  });
});
