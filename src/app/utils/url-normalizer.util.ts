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
 * - Rewrites the legacy backend host to the configured local backend
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

  // Preserve HTTPS URLs
  if (raw.startsWith('https://')) return raw;

  // Preserve localhost HTTP during development
  if (/^http:\/\/localhost(:\d+)?\//i.test(raw)) return raw;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?\//i.test(raw)) return raw;

  // Upgrade known production backend HTTP to HTTPS
  if (/^http:\/\/comarkerback\.roznahub\.com(?=\/|$)/i.test(raw)) {
    return raw.replace(/^https?:\/\/comarkerback\.roznahub\.com/i, 'http://localhost:5000');
  }

  // Handle relative /uploads/ paths
  if (raw.startsWith('/uploads/')) {
    const apiOrigin = String(environment.apiUrl || environment.API_URL || '')
      .replace(/\/api\/?$/i, '')
      .replace(/\/+$/, '');
    return `${apiOrigin}${raw}`;
  }

  // Return other URLs unchanged (external URLs, etc.)
  return raw;
}
