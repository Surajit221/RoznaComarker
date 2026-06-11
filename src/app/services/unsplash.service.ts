import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { tap, timeout, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface UnsplashImage {
  id: string;
  small: string; // ~400 px wide Unsplash CDN URL — use for both display AND selection
  alt: string | null;
}

interface CacheEntry {
  data: UnsplashImage[];
  ts: number;
}

@Injectable({ providedIn: 'root' })
export class UnsplashService {
  private readonly BASE_URL = environment.apiBaseUrl || environment.apiUrl;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly API_TIMEOUT = 15000; // 15 seconds — backend has 10s, this gives it buffer
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private http: HttpClient) {}

  /**
   * Search Unsplash images.
   * Results are cached in-memory for 5 minutes — repeated searches are instant.
   */
  searchImages(
    query: string,
    perPage = 12,
  ): Observable<{ success: boolean; data: UnsplashImage[] }> {
    const key = `${query.trim().toLowerCase()}:${perPage}`;
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      console.log(`[UNSPLASH] Cache HIT "${query}" — ${cached.data.length} images (instant)`);
      return of({ success: true, data: cached.data });
    }

    console.time(`[UNSPLASH] API "${query}"`);
    return this.http
      .get<{
        success: boolean;
        data: UnsplashImage[];
      }>(`${this.BASE_URL}/unsplash/search`, { params: { q: query.trim(), per_page: perPage.toString() } })
      .pipe(
        // Add 15-second timeout to prevent hanging
        timeout(this.API_TIMEOUT),
        tap((res) => {
          console.timeEnd(`[UNSPLASH] API "${query}"`);
          console.log(`[UNSPLASH] Received ${res.data?.length ?? 0} images for "${query}"`);
          if (res.success && res.data?.length) {
            this.cache.set(key, { data: res.data, ts: Date.now() });
          }
        }),
        catchError((err: any) => {
          console.error(`[UNSPLASH] Search failed for "${query}":`, err.message);
          // Return empty result on timeout instead of throwing — graceful degradation
          if (err.name === 'TimeoutError') {
            return of({ success: false, data: [] });
          }
          return throwError(() => err);
        }),
      );
  }

  /** Pre-warm the cache for common education topics */
  prewarm(): void {
    const topics = ['education', 'science', 'mathematics', 'english language'];
    for (const topic of topics) {
      const key = `${topic}:12`;
      if (!this.cache.has(key)) {
        this.searchImages(topic, 12).subscribe();
      }
    }
  }
}
