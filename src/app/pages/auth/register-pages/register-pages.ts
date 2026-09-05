import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

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
    if (referral) sessionStorage.setItem('pending_referral_code', referral);
    this.router.navigate(['/login']);
  }
}
