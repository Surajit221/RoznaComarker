import { Injectable } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DebounceService {
  createDebounce(delay: number = 300) {
    const subject = new Subject<string>();
    const debounced$ = subject.pipe(debounceTime(delay), distinctUntilChanged());

    return {
      subject,
      debounced$,
    };
  }
}
