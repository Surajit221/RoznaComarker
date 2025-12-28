import { Injectable, computed, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DeviceService {
    private width = signal(window.innerWidth);

    readonly isMobile = computed(() => this.width() <= 768);
    readonly isTablet = computed(() => this.width() > 768 && this.width() <= 1024);
    readonly isDesktop = computed(() => this.width() > 1024);

    constructor() {
        window.addEventListener('resize', () => {
            this.width.set(window.innerWidth);
        });
    }
}
