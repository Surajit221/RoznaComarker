import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarLp } from '../../components/lp/navbar-lp/navbar-lp';
import { FooterLp } from '../../components/lp/footer-lp/footer-lp';

@Component({
  selector: 'app-landing-page-layout',
  imports: [CommonModule, RouterOutlet, NavbarLp, FooterLp],
  templateUrl: './landing-page-layout.html',
  styleUrl: './landing-page-layout.css',
})
export class LandingPageLayout {}
