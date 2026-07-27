import { environment } from '../../environments/environment';

/**
 * URL Normalizer Utility
 * 
 * Normalizes URLs to ensure HTTPS for production backend domains while preserving
 * development localhost URLs, Blob URLs, Data URLs, and relative paths.
 */

/**
 * Normalizes a URL to HTTPS for known production backend domains.
 * 
 * Rules:
 * - Rewrites known backend and legacy local upload URLs to the configured backend
 * - Preserves HTTPS URLs unchanged
 * - Preserves Blob URLs (blob:...)
 * - Preserves Data URLs (data:...)
 * - Preserves localhost HTTP during development
 * - Converts relative /uploads/... paths to absolute HTTPS URLs
 * - Does not alter unrelated external URLs
 * 
 * @param url - The URL to normalize
 * @returns The normalized URL
 */
export function normalizeToHttps(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '';

  // Preserve Blob URLs
  if (raw.startsWith('blob:')) return raw;

  // Preserve Data URLs
  if (raw.startsWith('data:')) return raw;

  const apiOrigin = String(environment.apiUrl || environment.API_URL || '')
    .replace(/\/api\/?$/i, '')
    .replace(/\/+$/, '');

  // Repair only legacy/private backend upload URLs. Do not rewrite arbitrary
  // external assets (including Unsplash) or persist the repaired value.
  const localOrPrivateHost = (hostname: string): boolean =>
    /^(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/i
      .test(hostname);
  try {
    const parsed = new URL(raw);
    const isUpload = parsed.pathname.startsWith('/uploads/');
    if (isUpload && environment.production
      && (localOrPrivateHost(parsed.hostname) || parsed.hostname === 'comarkerback.roznahub.com')) {
      return `${apiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Relative paths are handled below.
  }

  // Preserve HTTPS URLs, including third-party image providers.
  if (raw.startsWith('https://')) return raw;

  // Preserve localhost HTTP during local development.
  if (/^http:\/\/localhost(:\d+)?\//i.test(raw)) return raw;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?\//i.test(raw)) return raw;

  // Upgrade known production backend HTTP to HTTPS
  if (/^http:\/\/comarkerback\.roznahub\.com(?=\/|$)/i.test(raw)) {
    return raw.replace(/^http:\/\/comarkerback\.roznahub\.com/i, apiOrigin);
  }

  // Handle relative /uploads/ paths
  if (raw.startsWith('/uploads/')) {
    return `${apiOrigin}${raw}`;
  }

  // Return other URLs unchanged (external URLs, etc.)
  return raw;
}

export function normalizeAssetUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls
    .map((value) => typeof value === 'string' ? normalizeToHttps(value) : '')
    .filter(Boolean);
}
