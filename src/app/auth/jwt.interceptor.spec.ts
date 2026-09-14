import { HttpHandler, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { environment } from '../../environments/environment';
import { JwtInterceptor } from './jwt.interceptor';

function token(): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 }));
  return `header.${payload}.signature`;
}

describe('JwtInterceptor backend boundary', () => {
  let interceptor: JwtInterceptor;
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('backend_jwt', token());
    interceptor = new JwtInterceptor();
  });

  function intercepted(url: string, headers = new HttpHeaders()): HttpRequest<unknown> {
    let captured: HttpRequest<unknown> | null = null;
    const handler: HttpHandler = { handle: (request) => {
      captured = request;
      return of(new HttpResponse({ status: 200 }));
    } };
    interceptor.intercept(new HttpRequest('GET', url, { headers }), handler).subscribe();
    return captured!;
  }

  it('attaches bearer credentials to API, files, and private compatibility uploads', () => {
    for (const path of ['/api/users/me', '/files/submissions/a.jpg', '/uploads/submissions/a.jpg', '/uploads/feedback/a.pdf']) {
      expect(intercepted(`${environment.backendUrl}${path}`).headers.get('Authorization')).toMatch(/^Bearer /u);
    }
  });

  it('does not attach credentials to public uploads or external origins', () => {
    for (const url of [`${environment.backendUrl}/uploads/avatars/a.jpg`, `${environment.backendUrl}/uploads/templates/a.jpg`,
      'https://example.com/api/users/me', `https://evil.example/?next=${environment.backendUrl}/api/users/me`]) {
      expect(intercepted(url).headers.has('Authorization')).toBeFalse();
    }
  });

  it('preserves an Authorization header supplied by the caller', () => {
    const request = intercepted(`${environment.backendUrl}/files/submissions/a.jpg`,
      new HttpHeaders({ Authorization: 'Bearer caller-token' }));
    expect(request.headers.get('Authorization')).toBe('Bearer caller-token');
  });
});
