import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar-lp',
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar-lp.html',
  styleUrl: './navbar-lp.css',
})
export class NavbarLp {
  // State untuk menu mobile
  isMobileMenuOpen = false;

  // Fungsi toggle buka/tutup
  toggleMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  // Fungsi untuk menutup menu saat link diklik (UX improvement)
  closeMenu() {
    this.isMobileMenuOpen = false;
  }

  scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    this.closeMenu(); // kalau mau auto close mobile menu
  }
}
