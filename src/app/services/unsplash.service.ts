import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UnsplashImage {
  id: string;
  thumb: string;
  regular: string;
  alt: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class UnsplashService {
  private readonly BASE_URL = environment.apiBaseUrl || environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Search Unsplash for images based on a query
   * Calls backend API which proxies to Unsplash
   * @param query - Search keyword
   * @param perPage - Number of results (default: 10)
   * @returns Observable of UnsplashImage[]
   */
  searchImages(query: string, perPage: number = 10): Observable<{ success: boolean; data: UnsplashImage[] }> {
    return this.http.get<{ success: boolean; data: UnsplashImage[] }>(
      `${this.BASE_URL}/unsplash/search`,
      {
        params: {
          q: query,
          per_page: perPage.toString()
        }
      }
    );
  }
}
