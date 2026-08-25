export interface BackendJwtPayload {
  id?: string;
  sub?: string;
  role?: string;
  exp?: number;
  iat?: number;
  jti?: string;
}

export function decodeBackendJwt(token: string | null): BackendJwtPayload | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const value: unknown = JSON.parse(atob(padded));
    return value && typeof value === 'object' ? value as BackendJwtPayload : null;
  } catch {
    return null;
  }
}

export function isBackendJwtUsable(token: string | null, nowMs = Date.now()): boolean {
  const payload = decodeBackendJwt(token);
  return Boolean(payload && typeof payload.exp === 'number' && payload.exp * 1000 > nowMs);
}

export function readUsableBackendJwt(): string | null {
  const token = localStorage.getItem('backend_jwt');
  if (isBackendJwtUsable(token)) return token;
  localStorage.removeItem('backend_jwt');
  return null;
}

export function clearPrivateAuthStorage(): void {
  localStorage.removeItem('backend_jwt');
  localStorage.removeItem('token');
  localStorage.removeItem('authToken');
  localStorage.removeItem('role');
  localStorage.removeItem('intended_role');
  localStorage.removeItem('preferred_role');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('authToken');
}
