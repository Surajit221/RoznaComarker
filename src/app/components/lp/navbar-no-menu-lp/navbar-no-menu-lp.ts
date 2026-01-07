import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-navbar-no-menu-lp',
  imports: [CommonModule],
  templateUrl: './navbar-no-menu-lp.html',
  styleUrl: './navbar-no-menu-lp.css',
})
export class NavbarNoMenuLp {
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
}
