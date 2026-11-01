import { InjectionToken, isDevMode } from '@angular/core';
import { KeyValueStore, sameOriginUrl } from './app-update.logic';

/** Everything the update service needs from the browser, behind one token so tests can replace it. */
export interface UpdateEnvironment {
  devMode(): boolean;
  /** The release id of the page that is running, from <meta name="app-release"> (written by scripts/stamp-release.cjs). */
  runningRelease(): string | null;
  /** GET the same-origin version.json, bypassing caches. Resolves to the parsed JSON; rejects on any failure. */
  fetchVersion(): Promise<unknown>;
  origin(): string;
  reload(): void;
  /** Full-page load of a URL that the caller has already checked is on this origin. */
  assign(url: string): void;
  session(): KeyValueStore | null;
  editableFocused(): boolean;
  visible(): boolean;
  now(): number;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  listen(target: 'window' | 'document', type: string, handler: (event: Event) => void): () => void;
}

const FETCH_TIMEOUT_MS = 10000;
const MAX_VERSION_BYTES = 4096;

function browserEnvironment(): UpdateEnvironment {
  const available = typeof window !== 'undefined' && typeof document !== 'undefined';
  return {
    devMode: () => isDevMode(),
    runningRelease: () => available ? document.querySelector('meta[name="app-release"]')?.getAttribute('content') ?? null : null,
    async fetchVersion() {
      // Relative to <base href>, and refused unless it stays on this origin: the check can never be pointed elsewhere.
      const url = sameOriginUrl(new URL('version.json', document.baseURI).pathname, location.origin);
      if (!url) throw new Error('version url');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new Error('version status');
        const text = await response.text();
        if (text.length > MAX_VERSION_BYTES) throw new Error('version size');
        return JSON.parse(text);
      } finally {
        clearTimeout(timer);
      }
    },
    origin: () => location.origin,
    reload: () => location.reload(),
    assign: url => location.assign(url),
    session: () => {
      try { return available ? window.sessionStorage : null; } catch { return null; }
    },
    editableFocused: () => {
      const element = available ? document.activeElement as HTMLElement | null : null;
      if (!element) return false;
      if (element.isContentEditable) return true;
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
      return element instanceof HTMLInputElement && !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'image', 'hidden'].includes(element.type);
    },
    visible: () => !available || document.visibilityState !== 'hidden',
    now: () => Date.now(),
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    listen: (target, type, handler) => {
      if (!available) return () => undefined;
      const node: EventTarget = target === 'window' ? window : document;
      node.addEventListener(type, handler);
      return () => node.removeEventListener(type, handler);
    },
  };
}

export const UPDATE_ENVIRONMENT = new InjectionToken<UpdateEnvironment>('UPDATE_ENVIRONMENT', {
  providedIn: 'root',
  factory: browserEnvironment,
});
