import { Component } from '@angular/core';

/**
 * The Rubrilo logo (the supplied horizontal logo: icon + name in ONE image) at the top of the pages a student or guest opens from a link: guest submission, guest results and
 * the recovery page. Centred at every width. Not a link. The signed-in app shell has its own logo and does not use this.
 */
@Component({
  selector: 'app-public-brand',
  standalone: true,
  template: `<div class="public-brand"><img src="logo_and_icon/logo/rubrilo-logo-horizontal-fullcolor@512w.png" alt="Rubrilo" width="512" height="164" /></div>`,
  styles: [`
    :host { display: block; }
    .public-brand { display: flex; align-items: center; justify-content: center; }
    .public-brand img { display: block; height: 40px; width: auto; max-width: 100%; }
  `]
})
export class PublicBrand {}
