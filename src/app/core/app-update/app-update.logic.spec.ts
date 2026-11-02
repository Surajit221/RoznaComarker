import {
  CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS, KeyValueStore, MAX_BACKOFF_MS, POLL_INTERVAL_MS, acquireChunkReload, isBusy, isChunkLoadError,
  isNewRelease, nextPollDelay, parseVersionPayload, sameOriginUrl,
} from './app-update.logic';

const A = 'a'.repeat(24), B = 'b'.repeat(24);
class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe('version comparison', () => {
  it('reports a new release only when both ids are valid and different', () => {
    expect(isNewRelease(A, B)).toBeTrue();
    expect(isNewRelease(A, A)).toBeFalse();
    expect(isNewRelease(null, B)).toBeFalse();
    expect(isNewRelease(A, null)).toBeFalse();
    expect(isNewRelease('dev', B)).toBeFalse();
    expect(isNewRelease(A, 'B'.repeat(24))).toBeFalse();       // uppercase is not a release id
  });
  it('parses only a well-formed version.json body', () => {
    expect(parseVersionPayload({ releaseId: B })).toBe(B);
    expect(parseVersionPayload({ releaseId: B, extra: 1 })).toBe(B);
    for (const bad of [null, undefined, 'x', 42, [], [B], {}, { releaseId: 5 }, { releaseId: 'short' }, { releaseId: `${B}<script>` }])
      expect(parseVersionPayload(bad)).toBeNull();
  });
  it('backs off after failures, capped, and recovers to the normal interval', () => {
    expect(nextPollDelay(0)).toBe(POLL_INTERVAL_MS);
    expect(nextPollDelay(1)).toBe(POLL_INTERVAL_MS * 2);
    expect(nextPollDelay(3)).toBe(POLL_INTERVAL_MS * 8);
    expect(nextPollDelay(50)).toBe(MAX_BACKOFF_MS);
    expect(nextPollDelay(-1)).toBe(POLL_INTERVAL_MS);
  });
});

describe('chunk-load error detection', () => {
  it('recognises the browser messages for a missing lazy chunk', () => {
    for (const message of ['Failed to fetch dynamically imported module: https://x/chunk-AB12.js', 'error loading dynamically imported module',
      'Importing a module script failed.', 'Loading chunk 42 failed.', 'Unable to preload CSS for /styles-x.css'])
      expect(isChunkLoadError(new TypeError(message))).withContext(message).toBeTrue();
    expect(isChunkLoadError({ name: 'ChunkLoadError', message: '' })).toBeTrue();
    expect(isChunkLoadError({ rejection: new TypeError('Failed to fetch dynamically imported module: x') })).toBeTrue();
  });
  it('ignores ordinary errors', () => {
    for (const error of [null, undefined, new Error('Http failure response'), new TypeError('Failed to fetch'), 'boom', {}])
      expect(isChunkLoadError(error)).toBeFalse();
  });
});

describe('chunk-error reload loop guard', () => {
  it('allows one reload, refuses a second inside the window, allows again after it', () => {
    const store = new MemoryStore(), t = 1_000_000;
    expect(acquireChunkReload(store, t)).toBeTrue();
    expect(acquireChunkReload(store, t + 1)).toBeFalse();
    expect(acquireChunkReload(store, t + CHUNK_RELOAD_WINDOW_MS - 1)).toBeFalse();
    expect(acquireChunkReload(store, t + CHUNK_RELOAD_WINDOW_MS)).toBeTrue();
  });
  it('refuses when storage is missing, throws or does not persist, so a broken storage can never loop', () => {
    expect(acquireChunkReload(null, 1)).toBeFalse();
    expect(acquireChunkReload({ getItem: () => { throw new Error('denied'); }, setItem: () => undefined }, 1)).toBeFalse();
    expect(acquireChunkReload({ getItem: () => null, setItem: () => undefined }, 1)).toBeFalse();
  });
  it('treats a corrupted or future timestamp safely', () => {
    const store = new MemoryStore();
    store.setItem(CHUNK_RELOAD_KEY, 'garbage');
    expect(acquireChunkReload(store, 5)).toBeTrue();
    store.setItem(CHUNK_RELOAD_KEY, String(10 ** 15));        // clock moved backwards: not a reason to block forever
    expect(acquireChunkReload(store, 5)).toBeTrue();
  });
});

describe('same-origin reload target', () => {
  const origin = 'https://comarkers.roznahub.com';
  it('accepts app paths on this origin', () => {
    expect(sameOriginUrl('/teacher/classes?x=1#top', origin)).toBe(`${origin}/teacher/classes?x=1#top`);
  });
  it('rejects anything that could leave the origin', () => {
    for (const bad of ['https://evil.example/', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', 'teacher', '', ' /x'])
      expect(sameOriginUrl(bad, origin)).withContext(bad).toBeNull();
  });
});

describe('busy state', () => {
  it('is busy while a request runs or a field is focused', () => {
    expect(isBusy({ inFlightRequests: 0, editableFocused: false })).toBeFalse();
    expect(isBusy({ inFlightRequests: 1, editableFocused: false })).toBeTrue();
    expect(isBusy({ inFlightRequests: 0, editableFocused: true })).toBeTrue();
    expect(isBusy({ inFlightRequests: 0, editableFocused: false, unsavedWork: true })).toBeTrue();
  });
});
