import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar-no-menu-lp',
  imports: [CommonModule, RouterModule],
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
