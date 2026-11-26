import { TestBed, fakeAsync, tick, flushMicrotasks, type ComponentFixture } from '@angular/core/testing';
import { HttpErrorResponse, HttpResponse, HttpEventType } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { SpeakingCoach } from './speaking-coach';
import { MEDIA_RECORDING } from '../speaking-recorder/speaking-recorder';
import { DeviceService } from '../../../services/device.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import type { CoachAttempt, CoachClient, CoachSession, CoachTask, CoachView } from '../../../api/speaking-coach-api.service';

const task = (over: Partial<CoachTask> = {}): CoachTask => ({ taskId: 't1', order: 1, type: 'repeat_improve', area: 'Grammar',
  prompt: 'Answer the task again. This time, focus on your grammar.', tip: 'Speak a little more slowly.', targets: [], maxSeconds: 90, status: 'current',
  attemptCount: 0, ...over });
const session = (over: Partial<CoachSession> = {}): CoachSession => ({ id: 's1', currentTaskId: 't1', attemptsUsed: 0, attemptsLeft: 20, endedReason: null,
  tasks: [task(), task({ taskId: 't2', order: 2, type: 'vocab_swap', area: 'Vocabulary', prompt: 'Answer again and use the new words.', status: 'locked',
    targets: ['on foot', 'peaceful'] })], activeAttempt: null, lastAttempt: null, ...over });
const attempt = (over: Partial<CoachAttempt> = {}): CoachAttempt => ({ id: 'a1', taskId: 't1', attemptNumber: 1, state: 'processing', nextStep: null,
  createdAt: '2026-11-26T10:00:00.000Z', ...over });
const READY_ATTEMPT = attempt({ state: 'ready', nextStep: 'next_task', feedback: { improved: ['You checked your verbs more carefully.'],
  stillWeak: ['Link your ideas with because.'], nextTip: 'Give one example for each idea.' },
  fluencyChange: { fewerLongPauses: true, fewerFillers: false, shorterLongestPause: true } });
const httpError = (status: number, code: string) => new HttpErrorResponse({ status, error: { success: false, code } });
const NOTICE = { version: 'speaking-coach-guest-2026-11', text: 'Practice recordings are sent to a speech-to-text service and checked with AI.', accepted: false };

function client(initial: CoachView | null): jasmine.SpyObj<CoachClient> {
  const spy = jasmine.createSpyObj<CoachClient>('CoachClient', ['getSession', 'start', 'uploadAttempt', 'getAttempt', 'retry']);
  spy.getSession.and.resolveTo(initial);
  return spy;
}
const fakeMedia = { supported: () => false, getUserMedia: () => Promise.reject(new Error('no')), isTypeSupported: () => false,
  create: () => { throw new Error('no'); } };

async function setup(coach: jasmine.SpyObj<CoachClient>, inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ imports: [SpeakingCoach], providers: [{ provide: MEDIA_RECORDING, useValue: fakeMedia },
    { provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } }] });
  const fixture = TestBed.createComponent(SpeakingCoach);
  fixture.componentRef.setInput('client', coach);
  fixture.componentRef.setInput('pollMs', 1000);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  return fixture;
}
const text = (fixture: ComponentFixture<SpeakingCoach>) => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') || '';
const button = (fixture: ComponentFixture<SpeakingCoach>, label: RegExp) =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')].find(b => label.test(b.textContent || '')) ?? null;
// What a student must never read on the coach.
const NO_MARKS = /\d+\s*%|\bscores?\b|\bgrades?\b|\blevels?\b|\bpass(ed)?\b|\bfail(ed)?\b|Excellent|Developing|Beginning/i;

describe('SpeakingCoach', () => {
  afterEach(() => { const unsaved = TestBed.inject(UnsavedWorkRegistry); for (const key of ['speaking-coach-upload', 'speaking-coach-recording']) unsaved.clear(key); });

  it('shows nothing when the coach is off or not there (null), or the result is not ready (unavailable)', fakeAsync(async () => {
    for (const view of [null, { state: 'unavailable', session: null } as CoachView]) {
      TestBed.resetTestingModule();
      const fixture = await setup(client(view));
      flushMicrotasks(); fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('section')).toBeNull();
      fixture.destroy();
    }
  }));

  describe('the card is always shown once the server has a coach (overview)', () => {
    const AREAS = [{ criterionId: 'speaking-task', title: 'Task and content', strength: 'Good', needsPractice: false },
      { criterionId: 'speaking-grammar', title: 'Grammar', strength: 'Developing', needsPractice: true },
      { criterionId: 'speaking-fluency', title: 'Fluency', strength: null, needsPractice: false }];
    const STRONG = AREAS.map(area => ({ ...area, strength: area.strength ?? 'Excellent', needsPractice: false }));
    const el = (fixture: ComponentFixture<SpeakingCoach>) => fixture.nativeElement as HTMLElement;
    const rows = (fixture: ComponentFixture<SpeakingCoach>) => [...el(fixture).querySelectorAll('.coach__area')].map(li => li.textContent!.replace(/\s+/g, ' ').trim());
    const startButton = (fixture: ComponentFixture<SpeakingCoach>) => button(fixture, /Start practice/);
    // The card may show each area's level title (the graded result shows it too) and Needs practice / Strong; never a number, score or grade.
    const NO_NUMBERS = /\d+\s*%|\bscores?\b|\bgrades?\b|\bpoints?\b|\bpass(ed)?\b|\bfail(ed)?\b/i;

    it('weak areas: each area with its level as the result shows it and Needs practice or Strong; Start practice enabled', fakeAsync(async () => {
      const coach = client({ state: 'idle', session: null, overview: { reason: null, areas: AREAS } });
      coach.start.and.resolveTo({ state: 'ready', session: session(), overview: { reason: null, areas: AREAS } });
      const fixture = await setup(coach);
      flushMicrotasks(); fixture.detectChanges();
      expect(rows(fixture)).toEqual(['Task and content Level: Good ✓ Strong', 'Grammar Level: Developing ● Needs practice', 'Fluency Not assessed']);
      expect(el(fixture).querySelector('.coach__areas')!.getAttribute('aria-label')).toBe('Your speaking areas');
      // The label is written out: colour is never the only signal; the symbols are hidden from screen readers.
      for (const icon of el(fixture).querySelectorAll('.coach__badge [aria-hidden="true"]')) expect(icon.textContent!.trim()).toMatch(/^[✓●]$/);
      expect(text(fixture)).not.toMatch(NO_NUMBERS);
      const start = startButton(fixture)!;
      expect(start.getAttribute('aria-disabled')).toBeNull();
      start.click(); flushMicrotasks(); fixture.detectChanges();
      expect(coach.start).toHaveBeenCalledTimes(1);
      fixture.destroy();
    }));

    it('no weak area: "Great work!", every area Strong, Start practice disabled with the reason read out', fakeAsync(async () => {
      const coach = client({ state: 'no_practice_needed', session: null, overview: { reason: 'no_weak_areas', areas: STRONG } });
      const fixture = await setup(coach);
      flushMicrotasks(); fixture.detectChanges();
      expect(text(fixture)).toContain('Great work! Every area is strong, so no practice is needed right now.');
      expect(rows(fixture).every(row => row.endsWith('Strong'))).toBeTrue();
      const start = startButton(fixture)!;
      expect(start.getAttribute('aria-disabled')).toBe('true');
      const reason = el(fixture).querySelector(`#${start.getAttribute('aria-describedby')}`);
      expect(reason?.textContent).toContain('Great work!');
      start.click(); flushMicrotasks();
      expect(coach.start).not.toHaveBeenCalled();
      // Nothing to start: start() itself refuses, whatever calls it.
      expect(fixture.componentInstance.canStart).toBeFalse();
      void fixture.componentInstance.start(); flushMicrotasks();
      expect(coach.start).not.toHaveBeenCalled();
      expect(text(fixture)).not.toMatch(NO_NUMBERS);
      fixture.destroy();
    }));

    it('not ready: "Practice opens when your result is ready", Start practice disabled, no areas', fakeAsync(async () => {
      const coach = client({ state: 'unavailable', session: null, overview: { reason: 'result_not_ready', areas: [] } });
      const fixture = await setup(coach);
      flushMicrotasks(); fixture.detectChanges();
      expect(text(fixture)).toContain('Practice opens when your result is ready');
      expect(startButton(fixture)!.getAttribute('aria-disabled')).toBe('true');
      expect(el(fixture).querySelector('.coach__areas')).toBeNull();
      startButton(fixture)!.click(); flushMicrotasks();
      expect(coach.start).not.toHaveBeenCalled();
      fixture.destroy();
    }));

    it('a result without rubric scores: the card says practice is not available (instead of hiding)', fakeAsync(async () => {
      const fixture = await setup(client({ state: 'unavailable', session: null, overview: { reason: 'no_rubric_scores', areas: [] } }));
      flushMicrotasks(); fixture.detectChanges();
      expect(text(fixture)).toContain('Practice is not available for this result.');
      expect(startButton(fixture)!.getAttribute('aria-disabled')).toBe('true');
      fixture.destroy();
    }));

    it('reloads when the result becomes ready (resultState changes), and stays put otherwise', fakeAsync(async () => {
      const coach = client({ state: 'unavailable', session: null, overview: { reason: 'result_not_ready', areas: [] } });
      const fixture = await setup(coach, { resultState: 'assessing' });
      flushMicrotasks(); fixture.detectChanges();
      coach.getSession.and.resolveTo({ state: 'idle', session: null, overview: { reason: null, areas: AREAS } });
      fixture.componentRef.setInput('resultState', 'assessing'); fixture.detectChanges(); flushMicrotasks();
      expect(coach.getSession).toHaveBeenCalledTimes(1);
      fixture.componentRef.setInput('resultState', 'ready'); fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
      expect(coach.getSession).toHaveBeenCalledTimes(2);
      expect(rows(fixture).length).toBe(3);
      expect(startButton(fixture)!.getAttribute('aria-disabled')).toBeNull();
      fixture.destroy();
    }));

    it('read only (a recovery-portal session) with weak areas: the areas, and the private-link note instead of Start practice', fakeAsync(async () => {
      const fixture = await setup(client({ state: 'idle', session: null, overview: { reason: null, areas: AREAS }, notice: NOTICE }), { guest: true, readOnly: true });
      flushMicrotasks(); fixture.detectChanges();
      expect(rows(fixture).length).toBe(3);
      expect(text(fixture)).toContain('Open the private link from your email to practise.');
      expect(startButton(fixture)).toBeNull();
      fixture.destroy();
    }));
  });

  it('a student: the notice, then Start practice opens the first task', fakeAsync(async () => {
    const coach = client({ state: 'idle', session: null });
    coach.start.and.resolveTo({ state: 'ready', session: session() });
    const fixture = await setup(coach);
    flushMicrotasks(); fixture.detectChanges();
    expect(text(fixture)).toContain('Practice never changes your mark');
    button(fixture, /Start practice/)!.click();
    flushMicrotasks(); fixture.detectChanges();
    expect(coach.start).toHaveBeenCalledWith(undefined);
    expect(text(fixture)).toContain('Task 1 of 2');
    expect(text(fixture)).toContain('Repeat and improve');
    expect(text(fixture)).toContain('Focus: Grammar');
    expect(text(fixture)).toContain('Answer the task again. This time, focus on your grammar.');
    expect(text(fixture)).toContain('Speak a little more slowly.');
    expect(text(fixture)).toContain('Recordings left: 20');
    // Each task's state is in words, never colour alone.
    const steps = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.coach__step')].map(li => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(steps[0]).toContain('Current');
    expect(steps[1]).toContain('Locked');
    expect((fixture.nativeElement as HTMLElement).querySelector('.coach__step[aria-current="step"]')).toBeTruthy();
    fixture.destroy();
  }));

  it('a guest: the server\'s practice notice must be ticked before starting; the version is sent', fakeAsync(async () => {
    const coach = client({ state: 'idle', session: null, notice: NOTICE });
    coach.start.and.resolveTo({ state: 'ready', session: session(), notice: { ...NOTICE, accepted: true } });
    const fixture = await setup(coach, { guest: true });
    flushMicrotasks(); fixture.detectChanges();
    expect(text(fixture)).toContain(NOTICE.text);
    const start = button(fixture, /Start practice/)!;
    expect(start.disabled).toBeTrue();
    const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    box.click(); fixture.detectChanges();
    expect(start.disabled).toBeFalse();
    start.click(); flushMicrotasks(); fixture.detectChanges();
    expect(coach.start).toHaveBeenCalledWith(NOTICE.version);
    fixture.destroy();
  }));

  it('a vocabulary swap shows its target words', fakeAsync(async () => {
    const s = session({ currentTaskId: 't2', tasks: [task({ status: 'done' }), task({ taskId: 't2', order: 2, type: 'vocab_swap', area: 'Vocabulary',
      targets: ['on foot', 'peaceful'], status: 'current' })] });
    const fixture = await setup(client({ state: 'ready', session: s }));
    flushMicrotasks(); fixture.detectChanges();
    expect(text(fixture)).toContain('Vocabulary swap');
    expect(text(fixture)).toContain('Use these words');
    expect([...(fixture.nativeElement as HTMLElement).querySelectorAll('.coach__chip')].map(c => c.textContent?.trim())).toEqual(['on foot', 'peaceful']);
    expect([...(fixture.nativeElement as HTMLElement).querySelectorAll('.coach__step')][0].textContent).toContain('Done');
    fixture.destroy();
  }));

  it('sending an answer: the upload, then "checking" until the feedback; never a score, level or pass word', fakeAsync(async () => {
    const coach = client({ state: 'ready', session: session() });
    const processing = { session: session({ activeAttempt: attempt(), lastAttempt: attempt(), attemptsUsed: 1, attemptsLeft: 19 }), attempt: attempt() };
    coach.uploadAttempt.and.returnValue(of({ type: HttpEventType.UploadProgress, loaded: 5, total: 10 } as never, new HttpResponse({ body: { success: true, data: processing } })));
    const checked = { session: session({ currentTaskId: 't2', attemptsUsed: 1, attemptsLeft: 19, lastAttempt: READY_ATTEMPT,
      tasks: [task({ status: 'done', attemptCount: 1 }), task({ taskId: 't2', order: 2, type: 'vocab_swap', area: 'Vocabulary', status: 'current', targets: ['on foot'] })] }),
    attempt: READY_ATTEMPT };
    coach.getAttempt.and.returnValues(Promise.resolve(processing), Promise.resolve(checked));
    const fixture = await setup(coach);
    flushMicrotasks(); fixture.detectChanges();
    const component = fixture.componentInstance;
    component.onRecording({ blob: new Blob([new Uint8Array(8)], { type: 'audio/webm' }), filename: 'practice.webm', durationSeconds: 12, source: 'microphone' });
    fixture.detectChanges();
    button(fixture, /Send my answer/)!.click();
    flushMicrotasks(); fixture.detectChanges();
    const [sessionId, taskId, blob, filename, requestId] = coach.uploadAttempt.calls.mostRecent().args;
    expect([sessionId, taskId, filename]).toEqual(['s1', 't1', 'practice.webm']);
    expect(blob.size).toBe(8);
    expect(requestId).toMatch(/^prc_/);
    expect(text(fixture)).toContain('Checking your answer');
    tick(1000); flushMicrotasks(); fixture.detectChanges();
    expect(text(fixture)).toContain('Checking your answer');
    tick(1000); flushMicrotasks(); fixture.detectChanges();
    expect(text(fixture)).toContain('What got better');
    expect(text(fixture)).toContain('You checked your verbs more carefully.');
    expect(text(fixture)).toContain('Keep working on');
    expect(text(fixture)).toContain('Link your ideas with because.');
    expect(text(fixture)).toContain('Next tip');
    expect(text(fixture)).toContain('You made fewer long pauses.');
    expect(text(fixture)).toContain('Well done! The next task is open.');
    expect(text(fixture)).toContain('Task 2 of 2');
    expect(text(fixture)).not.toMatch(NO_MARKS);
    expect(TestBed.inject(UnsavedWorkRegistry).has('speaking-coach-upload')).toBeFalse();
    fixture.destroy();
  }));

  it('while the answer uploads, the page counts as having unsaved work', fakeAsync(async () => {
    const coach = client({ state: 'ready', session: session() });
    coach.uploadAttempt.and.returnValue(new Subject<never>());
    const fixture = await setup(coach);
    flushMicrotasks(); fixture.detectChanges();
    fixture.componentInstance.onRecording({ blob: new Blob([new Uint8Array(8)]), filename: 'practice.webm', durationSeconds: 9, source: 'microphone' });
    fixture.detectChanges();
    button(fixture, /Send my answer/)!.click(); fixture.detectChanges();
    expect(TestBed.inject(UnsavedWorkRegistry).has('speaking-coach-upload')).toBeTrue();
    expect(text(fixture)).toContain('Sending…');
    fixture.destroy();
    expect(TestBed.inject(UnsavedWorkRegistry).has('speaking-coach-upload')).toBeFalse();
  }));

  it('an answer that could not be checked for lack of speech says why, and invites another try', fakeAsync(async () => {
    const last = attempt({ state: 'not_assessable', reason: 'not_enough_speech', nextStep: 'try_again' });
    const fixture = await setup(client({ state: 'ready', session: session({ lastAttempt: last, attemptsUsed: 1, attemptsLeft: 19 }) }));
    flushMicrotasks(); fixture.detectChanges();
    expect(text(fixture)).toContain('We could not hear enough words to check this answer');
    expect(text(fixture)).toContain('Have another go at this task');
    fixture.destroy();
  }));

  it('a failed check can be checked again', fakeAsync(async () => {
    const failed = attempt({ state: 'failed', failure: 'check', canRetry: true, nextStep: 'try_again' });
    const coach = client({ state: 'ready', session: session({ lastAttempt: failed, attemptsUsed: 1, attemptsLeft: 19 }) });
    coach.retry.and.resolveTo({ session: session({ activeAttempt: attempt(), lastAttempt: attempt() }), attempt: attempt() });
    coach.getAttempt.and.resolveTo({ session: session({ lastAttempt: READY_ATTEMPT }), attempt: READY_ATTEMPT });
    const fixture = await setup(coach);
    flushMicrotasks(); fixture.detectChanges();
    expect(text(fixture)).toContain('We could not check this answer');
    button(fixture, /Check again/)!.click();
    flushMicrotasks(); fixture.detectChanges();
    expect(coach.retry).toHaveBeenCalledWith('s1', 'a1');
    tick(1000); flushMicrotasks(); fixture.detectChanges();
    expect(text(fixture)).toContain('What got better');
    fixture.destroy();
  }));

  it('completed and capped: the end of practice, no recorder', fakeAsync(async () => {
    const done = await setup(client({ state: 'completed', session: session({ endedReason: 'completed', currentTaskId: null,
      lastAttempt: { ...READY_ATTEMPT, nextStep: 'finished' }, tasks: [task({ status: 'done' }), task({ taskId: 't2', order: 2, status: 'done' })] }) }));
    flushMicrotasks(); done.detectChanges();
    expect(text(done)).toContain('You finished every practice task');
    expect(done.nativeElement.querySelector('app-speaking-recorder')).toBeNull();
    done.destroy();
    TestBed.resetTestingModule();
    const capped = await setup(client({ state: 'capped', session: session({ endedReason: 'capped', attemptsLeft: 0, attemptsUsed: 20 }) }));
    flushMicrotasks(); capped.detectChanges();
    expect(text(capped)).toContain('You have used all your practice recordings');
    expect(capped.nativeElement.querySelector('app-speaking-recorder')).toBeNull();
    capped.destroy();
  }));

  it('read only (a recovery-portal session): the practice can be seen, not started or recorded', fakeAsync(async () => {
    const fixture = await setup(client({ state: 'ready', session: session(), notice: { ...NOTICE, accepted: true } }), { guest: true, readOnly: true });
    flushMicrotasks(); fixture.detectChanges();
    expect(text(fixture)).toContain('Open the private link from your email to practise');
    expect(fixture.nativeElement.querySelector('app-speaking-recorder')).toBeNull();
    fixture.destroy();
  }));

  it('refusals show fixed text (another answer still being checked; not open yet)', fakeAsync(async () => {
    const coach = client({ state: 'ready', session: session() });
    coach.uploadAttempt.and.returnValue(throwError(() => httpError(409, 'COACH_ATTEMPT_IN_PROGRESS')));
    const fixture = await setup(coach);
    flushMicrotasks(); fixture.detectChanges();
    fixture.componentInstance.onRecording({ blob: new Blob([new Uint8Array(8)]), filename: 'practice.webm', durationSeconds: 9, source: 'microphone' });
    fixture.detectChanges();
    button(fixture, /Send my answer/)!.click(); flushMicrotasks(); fixture.detectChanges();
    expect(text(fixture)).toContain('Your last answer is still being checked');
    fixture.destroy();
    TestBed.resetTestingModule();
    const late = client({ state: 'idle', session: null });
    late.start.and.rejectWith(httpError(409, 'COACH_RESULT_NOT_READY'));
    const second = await setup(late);
    flushMicrotasks(); second.detectChanges();
    button(second, /Start practice/)!.click(); flushMicrotasks(); second.detectChanges();
    expect(text(second)).toContain('Practice opens once your result is ready');
    second.destroy();
  }));

  it('an answer already being checked on load: it keeps checking until the feedback arrives', fakeAsync(async () => {
    const coach = client({ state: 'ready', session: session({ activeAttempt: attempt(), lastAttempt: attempt(), attemptsUsed: 1 }) });
    coach.getAttempt.and.resolveTo({ session: session({ lastAttempt: READY_ATTEMPT }), attempt: READY_ATTEMPT });
    const fixture = await setup(coach);
    flushMicrotasks(); fixture.detectChanges();
    expect(text(fixture)).toContain('Checking your answer');
    tick(1000); flushMicrotasks(); fixture.detectChanges();
    expect(coach.getAttempt).toHaveBeenCalledWith('s1', 'a1');
    expect(text(fixture)).toContain('What got better');
    fixture.destroy();
  }));
});
