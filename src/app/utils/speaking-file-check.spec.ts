import { RECORDING_ACCEPT, checkRecordingFile } from './speaking-file-check';

const LIMITS = { maxFileBytes: 1000, maxRecordingSeconds: 180 };
const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

describe('checkRecordingFile (the backend upload rules, checked before uploading)', () => {
  it('accepts each supported format; the file sent has a neutral name (never the student\'s own file name)', () => {
    for (const [name, type] of [['My talk.MP3', 'audio/mpeg'], ['a.m4a', 'audio/x-m4a'], ['a.mp4', 'audio/mp4'], ['a.webm', 'audio/webm'],
      ['a.webm', 'video/webm'], ['a.ogg', 'audio/ogg'], ['a.opus', 'audio/opus'], ['a.oga', 'audio/ogg'], ['a.wav', 'audio/wav'], ['a.wav', 'audio/x-wav']]) {
      const check = checkRecordingFile(file(name, type), LIMITS);
      expect(check.ok).withContext(name + ' ' + type).toBeTrue();
      if (check.ok) {
        expect(check.file.name).toMatch(/^recording\.[a-z0-9]+$/);
        expect(check.file.name).toBe('recording' + name.slice(name.lastIndexOf('.')).toLowerCase());
        expect(check.file.type).toBe(type);
        expect(check.file.size).toBe(10);
      }
    }
  });

  it('no type from the browser (common on Windows): the type of the extension is sent; the server still checks the content', () => {
    const check = checkRecordingFile(file('answer.opus', ''), LIMITS);
    expect(check.ok && check.file.type).toBe('audio/ogg');
  });

  it('refuses with the fixed messages: unsupported, a type that does not match the extension, empty, too large', () => {
    expect(checkRecordingFile(file('notes.txt', 'text/plain'), LIMITS)).toEqual({ ok: false, message: 'Please upload an MP3, M4A, WebM, Ogg or WAV recording.' });
    expect(checkRecordingFile(file('noextension', 'audio/mpeg'), LIMITS)).toEqual({ ok: false, message: 'Please upload an MP3, M4A, WebM, Ogg or WAV recording.' });
    expect(checkRecordingFile(file('a.mp3', 'audio/wav'), LIMITS))
      .toEqual({ ok: false, message: "This file's content does not match its type. Please upload the original recording." });
    expect(checkRecordingFile(file('a.mp3', 'audio/mpeg', 0), LIMITS)).toEqual({ ok: false, message: 'This file is empty. Please choose the recording again.' });
    const big = checkRecordingFile(file('a.mp3', 'audio/mpeg', 1001), LIMITS);
    expect(big.ok).toBeFalse();
    if (!big.ok) expect(big.message).toContain('too large');
    expect(checkRecordingFile(file('a.mp3', 'audio/mpeg', 1000), LIMITS).ok).toBeTrue();
  });

  it('the picker accepts the same extensions and types', () => {
    for (const part of ['.mp3', '.m4a', '.mp4', '.webm', '.ogg', '.oga', '.opus', '.wav', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav'])
      expect(RECORDING_ACCEPT.split(',')).toContain(part);
  });
});
