import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register-pages',
  imports: [],
  templateUrl: './register-pages.html',
  styleUrl: './register-pages.css',
})
export class RegisterPages {
  constructor(private router: Router) {}

  ngOnInit() {
    this.router.navigate(['/login']);
  }
}
