import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = localStorage.getItem('backend_jwt');
    
    // Do not attach authorization to public static file requests (uploads)
    // These are publicly accessible and don't require authentication
    const url = req.url.toLowerCase();
    if (url.includes('/uploads/') || url.startsWith('/uploads/')) {
      return next.handle(req);
    }
    
    if (token && !req.headers.has('Authorization')) {
      req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }
    return next.handle(req);
  }
}
