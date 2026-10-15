// Lazy access also catches Safari throwing when the Storage property is read.
const fallback = new Map<string, string>();
type Area = 'localStorage' | 'sessionStorage';
export function readStorage(key: string, area: Area = 'localStorage'): string | null {
  try { return globalThis[area].getItem(key) ?? fallback.get(`${area}:${key}`) ?? null; }
  catch { return fallback.get(`${area}:${key}`) ?? null; }
}
export function writeStorage(key: string, value: string, area: Area = 'localStorage'): void {
  try { globalThis[area].setItem(key, value); fallback.delete(`${area}:${key}`); }
  catch { fallback.set(`${area}:${key}`, value); }
}
export function removeStorage(key: string, area: Area = 'localStorage'): void {
  fallback.delete(`${area}:${key}`);
  try { globalThis[area].removeItem(key); } catch { /* URL/in-memory recovery remains available. */ }
}
