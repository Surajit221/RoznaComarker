import type { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Server-owned private page images only; no arbitrary external media URL. */
const PAGE_IMAGE = /^\/files\/submissions\/[a-f0-9-]{36}\.jpg$/;

/**
 * One download per page image, however many views show it (the teacher's page and the review workspace). The object URL lives while someone
 * holds it and is released with the last holder, so closing the workspace frees memory the page is not using.
 */
export class SharedPageImages {
  private readonly held = new Map<string, { holders: number; url: Promise<string>; resolved?: string }>();
  constructor(private readonly http: Pick<HttpClient, 'get'>) {}

  acquire(source: string): Promise<string> {
    if (!PAGE_IMAGE.test(source)) return Promise.reject(new Error('PAGE_IMAGE_REFUSED'));
    const existing = this.held.get(source);
    if (existing) { existing.holders++; return existing.url; }
    const url = firstValueFrom(this.http.get(`${environment.backendUrl.replace(/\/+$/, '')}${source}`, { responseType: 'blob' })).then(blob => {
      const made = URL.createObjectURL(blob), current = this.held.get(source);
      if (current?.url === url) current.resolved = made; else URL.revokeObjectURL(made);
      return made;
    });
    this.held.set(source, { holders: 1, url });
    url.catch(() => { if (this.held.get(source)?.url === url) this.held.delete(source); });
    return url;
  }

  release(source: string): void {
    const entry = this.held.get(source);
    if (!entry || --entry.holders > 0) return;
    this.held.delete(source);
    if (entry.resolved) URL.revokeObjectURL(entry.resolved);
  }

  /** The page is going away. */
  destroy(): void {
    for (const entry of this.held.values()) if (entry.resolved) URL.revokeObjectURL(entry.resolved);
    this.held.clear();
  }
}
