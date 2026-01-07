import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarNoMenuLp } from '../../components/lp/navbar-no-menu-lp/navbar-no-menu-lp';
import { FooterLp } from '../../components/lp/footer-lp/footer-lp';

@Component({
  selector: 'app-tnc-pp-layout',
  imports: [CommonModule, RouterOutlet, NavbarNoMenuLp, FooterLp],
  templateUrl: './tnc-pp-layout.html',
  styleUrl: './tnc-pp-layout.css',
})
export class TncPpLayout {

}
