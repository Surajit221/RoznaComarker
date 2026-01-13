import { Component, inject } from '@angular/core';
import { DeviceService } from '../../../services/device.service';
import { CommonModule } from '@angular/common';
import { TruncatePipe } from "../../../pipe/truncate.pipe";
import { AuthService } from '../../../auth/auth.service';

@Component({
  selector: 'app-my-profile-pages',
  imports: [CommonModule],
  templateUrl: './my-profile-pages.html',
  styleUrl: './my-profile-pages.css',
})
export class MyProfilePages {
  device = inject(DeviceService);
  private auth = inject(AuthService);

  meName: string = '';
  meId: string = '';
  notifications: Array<{
    icon: string;
    iconBg: string;
    iconColor: string;
    title: string;
    description: string;
    time: string;
  }> = [];

  async ngOnInit() {
    try {
      const me = await this.auth.getMeProfile();
      this.meName = me.displayName || me.email || '';
      this.meId = me.id ? String(me.id) : '';
    } catch {
      this.meName = '';
      this.meId = '';
    }
  }
}
