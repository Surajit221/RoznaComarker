// Pure, dependency-free helpers for stale-version prevention. No DOM access here, so every rule is unit-testable.

/** A release id is what scripts/stamp-release.cjs writes: 24 lowercase hex characters (a hash of the built assets). */
const RELEASE_ID = /^[a-f0-9]{24}$/;

export const POLL_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_BACKOFF_MS = 60 * 60 * 1000;
/** Focus, visibility and reconnect checks are skipped when the last check was this recent. */
export const MIN_CHECK_GAP_MS = 60 * 1000;
/** After one chunk-error reload, no second automatic reload is allowed within this window. */
export const CHUNK_RELOAD_WINDOW_MS = 5 * 60 * 1000;
export const CHUNK_RELOAD_KEY = 'app-update:chunk-reload-at';

export function isReleaseId(value: unknown): value is string {
  return typeof value === 'string' && RELEASE_ID.test(value);
}

/** version.json body -> release id, or null for anything unexpected (bad JSON shape, wrong type, extra noise is ignored). */
export function parseVersionPayload(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const id = (body as { releaseId?: unknown }).releaseId;
  return isReleaseId(id) ? id : null;
}

/** A new version exists only when both ids are valid and differ. Unknown or invalid ids never trigger an update. */
export function isNewRelease(running: string | null, published: string | null): boolean {
  return isReleaseId(running) && isReleaseId(published) && running !== published;
}

/** Delay before the next poll: the normal interval, doubled per consecutive failure, capped. */
export function nextPollDelay(consecutiveFailures: number): number {
  const failures = Math.max(0, Math.min(10, Math.floor(consecutiveFailures)));
  return Math.min(MAX_BACKOFF_MS, POLL_INTERVAL_MS * 2 ** failures);
}

const CHUNK_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk [\w-]+ failed/i,
  /loading css chunk/i,
  /unable to preload css/i,
];

/** True for the errors a browser raises when a lazy chunk referenced by an old page no longer exists on the server. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: unknown; message?: unknown; rejection?: unknown };
  if (e.name === 'ChunkLoadError') return true;
  const message = typeof e.message === 'string' ? e.message : typeof error === 'string' ? error : '';
  if (CHUNK_PATTERNS.some(pattern => pattern.test(message))) return true;
  // Zone wraps unhandled promise rejections: look one level in.
  return e.rejection !== undefined && e.rejection !== error && isChunkLoadError(e.rejection);
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Loop guard for the chunk-error reload. Returns true (and records the time) only when no automatic reload happened in the last
 * CHUNK_RELOAD_WINDOW_MS. Without working storage it refuses, so a broken storage can never cause a reload loop.
 */
export function acquireChunkReload(store: KeyValueStore | null, now: number): boolean {
  if (!store) return false;
  try {
    const last = Number(store.getItem(CHUNK_RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last >= 0 && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    store.setItem(CHUNK_RELOAD_KEY, String(now));
    return store.getItem(CHUNK_RELOAD_KEY) === String(now);
  } catch {
    return false;
  }
}

/**
 * Turns a router URL into an absolute URL on the current origin, or null. Rejects anything that could leave the origin
 * (absolute URLs, protocol-relative "//host", backslash tricks, javascript: and other schemes).
 */
export function sameOriginUrl(target: string, origin: string): string | null {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return null;
  try {
    const url = new URL(target, origin);
    return url.origin === new URL(origin).origin ? url.href : null;
  } catch {
    return null;
  }
}

export interface BusySignals {
  inFlightRequests: number;
  editableFocused: boolean;
}

/** The app is busy when a request is running (upload, submit, save) or the user is typing in a field. Never auto-reload then. */
export function isBusy(signals: BusySignals): boolean {
  return signals.inFlightRequests > 0 || signals.editableFocused;
}
