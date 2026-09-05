import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
@Injectable({ providedIn: 'root' })
export class CreditTopupUiService { private readonly requests=new Subject<void>();readonly openRequests$=this.requests.asObservable();open():void{this.requests.next()} }
