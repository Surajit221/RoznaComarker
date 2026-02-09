import { Injectable, computed, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DeviceService {
    private width = signal(this.getViewportWidth());

    readonly isMobile = computed(() => this.width() <= 768);
    readonly isTablet = computed(() => this.width() > 768 && this.width() <= 1024);
    readonly isDesktop = computed(() => this.width() > 1024);

    private getViewportWidth(): number {
        const vv = window.visualViewport;
        const w = typeof vv?.width === 'number' && Number.isFinite(vv.width)
            ? vv.width
            : (document.documentElement?.clientWidth || window.innerWidth);
        return Math.round(Number(w) || window.innerWidth);
    }

    constructor() {
        const update = () => this.width.set(this.getViewportWidth());

        update();

        window.addEventListener('resize', update, { passive: true });
        window.addEventListener('orientationchange', update, { passive: true } as any);

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', update, { passive: true });
            window.visualViewport.addEventListener('scroll', update, { passive: true });
        }
    }
}
