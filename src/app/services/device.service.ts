import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

export const MOBILE_MAX_WIDTH = 768;
export const COMPACT_MAX_WIDTH = 1024;
export const COMPACT_VIEW_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`;
export type DeviceViewport = 'mobile' | 'tablet' | 'desktop';
export function classifyDeviceWidth(width: number): DeviceViewport {
    if (width <= MOBILE_MAX_WIDTH) return 'mobile';
    if (width <= COMPACT_MAX_WIDTH) return 'tablet';
    return 'desktop';
}

@Injectable({ providedIn: 'root' })
export class DeviceService {
    private readonly destroyRef = inject(DestroyRef);
    private width = signal(this.getViewportWidth());

    readonly viewport = computed(() => classifyDeviceWidth(this.width()));
    readonly isMobile = computed(() => this.viewport() === 'mobile');
    readonly isTablet = computed(() => this.viewport() === 'tablet');
    readonly isCompact = computed(() => this.viewport() !== 'desktop');
    readonly isDesktop = computed(() => this.viewport() === 'desktop');

    private getViewportWidth(): number {
        if (typeof window === 'undefined') return COMPACT_MAX_WIDTH + 1;
        const vv = window.visualViewport;
        const w = typeof vv?.width === 'number' && Number.isFinite(vv.width)
            ? vv.width
            : (document.documentElement?.clientWidth || window.innerWidth);
        return Math.round(Number(w) || window.innerWidth);
    }

    constructor() {
        const update = () => this.width.set(this.getViewportWidth());

        update();

        if (typeof window === 'undefined') return;
        window.addEventListener('resize', update, { passive: true });
        window.addEventListener('orientationchange', update, { passive: true });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', update, { passive: true });
            window.visualViewport.addEventListener('scroll', update, { passive: true });
        }

        this.destroyRef.onDestroy(() => {
            window.removeEventListener('resize', update);
            window.removeEventListener('orientationchange', update);
            window.visualViewport?.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('scroll', update);
        });
    }
}
