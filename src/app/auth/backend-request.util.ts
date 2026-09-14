import { environment } from '../../environments/environment';

export type BackendRequestAccess = 'authenticated' | 'public' | 'external';

export interface BackendRequestClassification {
  access: BackendRequestAccess;
  pathname: string | null;
}

const AUTHENTICATED_ROOTS = ['/api', '/files', '/upload'] as const;
const PRIVATE_UPLOAD_ROOTS = [
  '/uploads/submissions',
  '/uploads/assignments',
  '/uploads/feedback',
  '/uploads/original',
  '/uploads/processed'
] as const;
const PUBLIC_UPLOAD_ROOTS = [
  '/uploads/avatars',
  '/uploads/class-banners',
  '/uploads/flashcards',
  '/uploads/templates'
] as const;

function matchesRoot(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function backendPathname(rawUrl: string, backendUrl: string): string | null {
  if (!rawUrl || rawUrl !== rawUrl.trim() || /[\\\u0000-\u001f\u007f]/u.test(rawUrl)) return null;
  try {
    const backend = new URL(backendUrl);
    if (!['http:', 'https:'].includes(backend.protocol) || backend.username || backend.password) return null;

    const relative = rawUrl.startsWith('/') && !rawUrl.startsWith('//');
    const parsed = relative ? new URL(rawUrl, backend.origin) : new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    if (!relative && parsed.origin !== backend.origin) return null;
    return parsed.pathname.toLowerCase();
  } catch {
    return null;
  }
}

export function classifyBackendRequest(
  rawUrl: string,
  backendUrl = environment.backendUrl
): BackendRequestClassification {
  const pathname = backendPathname(rawUrl, backendUrl);
  if (!pathname) return { access: 'external', pathname: null };
  if (PUBLIC_UPLOAD_ROOTS.some((root) => matchesRoot(pathname, root))) {
    return { access: 'public', pathname };
  }
  if (AUTHENTICATED_ROOTS.some((root) => matchesRoot(pathname, root))
    || PRIVATE_UPLOAD_ROOTS.some((root) => matchesRoot(pathname, root))) {
    return { access: 'authenticated', pathname };
  }
  return { access: 'external', pathname };
}
