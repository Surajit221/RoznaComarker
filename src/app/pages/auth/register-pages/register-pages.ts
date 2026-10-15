import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { writeStorage } from '../../../auth/safe-browser-storage';
import { isQrJoinUrl } from '../../../auth/safe-return-url';

@Component({
  selector: 'app-register-pages',
  imports: [],
  templateUrl: './register-pages.html',
  styleUrl: './register-pages.css',
})
export class RegisterPages {
  constructor(private router: Router, private route: ActivatedRoute) {}

  ngOnInit() {
    const referral = this.route.snapshot.queryParamMap.get('ref')?.trim();
    if (referral) writeStorage('pending_referral_code', referral, 'sessionStorage');
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (isQrJoinUrl(returnUrl)) this.router.navigate(['/login'], { queryParams: { returnUrl }, replaceUrl: true });
    else this.router.navigate(['/login']);
  }
}
