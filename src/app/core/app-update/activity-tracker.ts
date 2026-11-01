import { Injectable, inject, signal } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable, defer, finalize } from 'rxjs';

/** Counts HTTP requests that are still running (uploads, submissions, saves). Read by the update service; never blocks requests. */
@Injectable({ providedIn: 'root' })
export class ActivityTracker {
  readonly inFlight = signal(0);
  start(): void { this.inFlight.update(n => n + 1); }
  end(): void { this.inFlight.update(n => Math.max(0, n - 1)); }
}

/** Observation only: the request and response pass through unchanged. */
@Injectable()
export class InFlightInterceptor implements HttpInterceptor {
  private readonly tracker = inject(ActivityTracker);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Counted per subscription, so a request that is built but never sent can not leave the counter stuck above zero.
    return defer(() => {
      this.tracker.start();
      return next.handle(request).pipe(finalize(() => this.tracker.end()));
    });
  }
}
