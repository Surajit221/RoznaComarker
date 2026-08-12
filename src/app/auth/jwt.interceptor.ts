import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { readUsableBackendJwt } from './backend-token.util';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = readUsableBackendJwt();
    
    // Presentation uploads are public. Private files use authenticated /files
    // endpoints and continue receiving the bearer header.
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
