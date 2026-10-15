function hasUnsafeCharacters(value: string): boolean {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return character === '\\' || code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

export function safeInternalReturnUrl(value: unknown): string | null {
  if (typeof value !== 'string' || hasUnsafeCharacters(value)) return null;
  const original = value.trim();
  if (!original.startsWith('/') || original.startsWith('//') || /%(?![\da-f]{2})/iu.test(original)) return null;
  let decoded = original;
  try {
    for (let i = 0; i < 5; i++) {
      if (hasUnsafeCharacters(decoded) || !decoded.startsWith('/') || decoded.startsWith('//')) return null;
      if (/^\/(?:https?|javascript|data):/iu.test(decoded)) return null;
      const parsed = new URL(decoded, 'https://internal.invalid');
      if (parsed.origin !== 'https://internal.invalid'
        || /^\/(?:login|register|select-role|verify-email|auth|__\/auth)(?:[/?#]|$)/iu.test(parsed.pathname)) return null;
      if (!/%[\da-f]{2}/iu.test(decoded)) return original;
      decoded = decodeURIComponent(decoded);
    }
  } catch { return null; }
  return null;
}

export function isQrJoinUrl(value: unknown): value is string {
  const safe = safeInternalReturnUrl(value);
  return Boolean(safe && new URL(safe, 'https://internal.invalid').pathname === '/student/join-class');
}

export function authContinuationUrl(frontend: string, path: '/verify-email' | '/login', returnUrl?: string | null): string {
  const base = frontend.replace(/\/+$/u, '') + path;
  return isQrJoinUrl(returnUrl) ? base + '?returnUrl=' + encodeURIComponent(returnUrl) : base;
}
