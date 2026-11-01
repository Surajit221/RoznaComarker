import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UpdateBanner } from './core/app-update/update-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UpdateBanner],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('rozna-comarker-fe');
}
