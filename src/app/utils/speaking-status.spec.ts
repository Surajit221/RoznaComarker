import { fakeAsync, tick } from '@angular/core/testing';
import { SpeakingPoller, studentSpeakingStatus } from './speaking-status';

describe('studentSpeakingStatus (fixed text for every state; the server\'s text is never used)', () => {
  it('in progress: transcribing and marking keep polling', () => {
    expect(studentSpeakingStatus({ state: 'transcribing', reason: null })).toEqual(jasmine.objectContaining({ tone: 'progress', final: false,
      message: 'Turning your recording into text…' }));
    expect(studentSpeakingStatus({ state: 'assessing', reason: null })).toEqual(jasmine.objectContaining({ tone: 'progress', final: false,
      message: 'Marking your recording…' }));
  });

  it('marked, or waiting for the teacher (never mentions credits or failures)', () => {
    expect(studentSpeakingStatus({ state: 'ready', reason: null })).toEqual(jasmine.objectContaining({ tone: 'done', final: true }));
    for (const state of ['awaiting_teacher', 'blocked', 'failed'] as const) {
      const view = studentSpeakingStatus({ state, reason: null });
      expect(view).toEqual(jasmine.objectContaining({ tone: 'waiting', final: true, message: 'Your teacher will check this recording.', invitesNewRecording: false }));
      expect(view.message).not.toMatch(/credit|fail|error/i);
    }
  });

  it('not enough speech and each not-assessable reason: their own text, and a new recording is invited', () => {
    expect(studentSpeakingStatus({ state: 'not_enough_speech', reason: null }))
      .toEqual(jasmine.objectContaining({ tone: 'problem', final: true, invitesNewRecording: true, message: jasmine.stringMatching(/enough speech/) }));
    expect(studentSpeakingStatus({ state: 'not_assessable', reason: 'not_english' }).message).toMatch(/not in English/);
    expect(studentSpeakingStatus({ state: 'not_assessable', reason: 'unintelligible' }).message).toMatch(/understood/);
    expect(studentSpeakingStatus({ state: 'not_assessable', reason: 'too_long' }).message).toMatch(/too long/);
    expect(studentSpeakingStatus({ state: 'not_assessable', reason: null }).invitesNewRecording).toBeTrue();
  });

  it('transcription failed: retry only when the server allows it', () => {
    expect(studentSpeakingStatus({ state: 'transcription_failed', reason: null }, { canRetry: true }))
      .toEqual(jasmine.objectContaining({ tone: 'problem', final: true, canRetryTranscription: true, message: "We couldn't turn this recording into text." }));
    expect(studentSpeakingStatus({ state: 'transcription_failed', reason: null }, { canRetry: false }).canRetryTranscription).toBeFalse();
    expect(studentSpeakingStatus({ state: 'ready', reason: null }, { canRetry: true }).canRetryTranscription).toBeFalse();
  });

  it('speech-to-text temporarily unavailable (operational): its own message, not "couldn\'t turn into text", no new recording asked', () => {
    const status = studentSpeakingStatus({ state: 'transcription_failed', reason: 'stt_unavailable' }, { canRetry: true });
    expect(status).toEqual(jasmine.objectContaining({ tone: 'problem', final: true, canRetryTranscription: true, invitesNewRecording: false,
      message: 'Speech-to-text is temporarily unavailable. Please try again later.' }));
  });

  it('an unknown state reads as in progress, never as a result', () => {
    expect(studentSpeakingStatus({ state: 'something_new' as never, reason: null })).toEqual(jasmine.objectContaining({ tone: 'progress', final: false }));
  });
});

describe('SpeakingPoller', () => {
  it('asks again every interval until the answer is final, then stops', fakeAsync(() => {
    const answers = [false, false, true];
    let calls = 0;
    const poller = new SpeakingPoller(async () => answers[calls++] ?? true, 10000);
    poller.start();
    tick(0); expect(calls).toBe(1);
    tick(9999); expect(calls).toBe(1);
    tick(1); expect(calls).toBe(2);
    tick(10000); expect(calls).toBe(3);
    tick(30000); expect(calls).toBe(3);
    expect(poller.running).toBeFalse();
  }));

  it('stop() ends it; start() again restarts it; a failed check keeps polling', fakeAsync(() => {
    let calls = 0;
    const poller = new SpeakingPoller(async () => { calls++; if (calls === 1) throw new Error('offline'); return false; }, 1000);
    poller.start(); tick(0); tick(1000);
    expect(calls).toBe(2);
    poller.stop(); tick(5000);
    expect(calls).toBe(2);
    poller.start(); tick(0);
    expect(calls).toBe(3);
    poller.stop();
  }));
});
