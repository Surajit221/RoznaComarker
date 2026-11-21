import { speakingProgress, studentSpeakingStatus, teacherSpeakingStatus } from './speaking-status';

const recording = (over: Record<string, unknown> = {}) => ({ status: 'ready', lastErrorCode: null, audioAvailable: true, ...over });

describe('teacherSpeakingStatus (fixed text; the teacher sees why and can act)', () => {
  it('in progress and marked', () => {
    expect(teacherSpeakingStatus({ state: 'transcribing', reason: null }, recording({ status: 'queued' }))).toEqual(jasmine.objectContaining({ tone: 'progress', final: false,
      message: 'Turning the recording into text…' }));
    expect(teacherSpeakingStatus({ state: 'assessing', reason: null }, recording())).toEqual(jasmine.objectContaining({ tone: 'progress', final: false,
      message: 'Marking the recording…' }));
    expect(teacherSpeakingStatus({ state: 'ready', reason: null }, recording())).toEqual(jasmine.objectContaining({ tone: 'done', final: true }));
  });

  it('out of credits: says so and offers Retry marking; a failed run offers it too', () => {
    const blocked = teacherSpeakingStatus({ state: 'blocked', reason: null, errorCode: 'INSUFFICIENT_ASSESSMENT_CREDITS', canRetryAssessment: true }, recording());
    expect(blocked).toEqual(jasmine.objectContaining({ tone: 'problem', final: true, canRetryAssessment: true,
      message: "You're out of assessment credits. Add credits, then retry marking." }));
    const failed = teacherSpeakingStatus({ state: 'failed', reason: null, errorCode: 'AI_OUTPUT_VALIDATION_FAILED', canRetryAssessment: true }, recording());
    expect(failed).toEqual(jasmine.objectContaining({ tone: 'problem', canRetryAssessment: true, message: "Marking didn't finish. Try marking again." }));
    expect(failed.message).not.toContain('AI_OUTPUT');
    expect(teacherSpeakingStatus({ state: 'failed', reason: null, canRetryAssessment: false }, recording()).canRetryAssessment).toBeFalse();
  });

  it('transcription failed: the minutes codes have their own text; retry only while the audio is still there', () => {
    expect(teacherSpeakingStatus({ state: 'transcription_failed', reason: null }, recording({ status: 'failed', lastErrorCode: 'AUDIO_MONTHLY_MINUTES_EXCEEDED' })).message)
      .toBe("We couldn't turn this recording into text. This month's speech-to-text minutes are used up.");
    expect(teacherSpeakingStatus({ state: 'transcription_failed', reason: null }, recording({ status: 'failed', lastErrorCode: 'AUDIO_DAILY_MINUTES_EXCEEDED' })).message)
      .toBe("We couldn't turn this recording into text. Today's speech-to-text minutes are used up. Try again tomorrow.");
    for (const code of ['AUDIO_STT_PROVIDER_CREDITS', 'AUDIO_STT_NOT_CONFIGURED']) {
      const operational = teacherSpeakingStatus({ state: 'transcription_failed', reason: null }, recording({ status: 'failed', lastErrorCode: code }));
      expect(operational).toEqual(jasmine.objectContaining({ message: 'Speech-to-text is temporarily unavailable. Please try again later.', canRetryTranscription: true }));
    }
    expect(teacherSpeakingStatus({ state: 'transcription_failed', reason: 'stt_unavailable' }, null).message)
      .toBe('Speech-to-text is temporarily unavailable. Please try again later.');
    expect(teacherSpeakingStatus({ state: 'transcription_failed', reason: null }, recording({ status: 'failed', lastErrorCode: 'AUDIO_STT_UNRELIABLE_RESULT' })).message)
      .toBe("We couldn't turn this recording into text.");
    const other = teacherSpeakingStatus({ state: 'transcription_failed', reason: null }, recording({ status: 'failed', lastErrorCode: 'AUDIO_STT_TIMEOUT' }));
    expect(other).toEqual(jasmine.objectContaining({ message: "We couldn't turn this recording into text.", canRetryTranscription: true }));
    expect(teacherSpeakingStatus({ state: 'transcription_failed', reason: null }, recording({ status: 'failed', audioAvailable: false })).canRetryTranscription).toBeFalse();
    expect(teacherSpeakingStatus({ state: 'transcription_failed', reason: null }, recording({ status: 'transcribing' })).canRetryTranscription).toBeFalse();
  });

  it('not enough speech and not assessable: their own fixed text, nothing to retry', () => {
    const short = teacherSpeakingStatus({ state: 'not_enough_speech', reason: null }, recording());
    expect(short).toEqual(jasmine.objectContaining({ tone: 'problem', final: true, canRetryAssessment: false, canRetryTranscription: false }));
    expect(short.message).toMatch(/enough speech/);
    expect(teacherSpeakingStatus({ state: 'not_assessable', reason: 'not_english' }, recording()).message).toMatch(/not in English/);
    expect(teacherSpeakingStatus({ state: 'not_assessable', reason: 'unintelligible' }, recording()).message).toMatch(/understood/);
  });

  it('the student never gets a marking retry', () => {
    expect(studentSpeakingStatus({ state: 'awaiting_teacher', reason: null }).canRetryAssessment).toBeFalse();
  });
});

describe('speakingProgress (for app-analysis-progress)', () => {
  it('in progress: active and indeterminate; marked: complete; waiting: no bar; problem: failed', () => {
    expect(speakingProgress({ tone: 'progress', message: 'm' })).toEqual(jasmine.objectContaining({ status: 'processing', active: true, indeterminate: true, message: 'm' }));
    expect(speakingProgress({ tone: 'done', message: 'm' })).toEqual(jasmine.objectContaining({ status: 'completed', completed: true, active: false }));
    expect(speakingProgress({ tone: 'waiting', message: 'm' })).toEqual(jasmine.objectContaining({ status: 'partial', failed: false, active: false }));
    expect(speakingProgress({ tone: 'problem', message: 'm' })).toEqual(jasmine.objectContaining({ status: 'failed', failed: true }));
  });
});
