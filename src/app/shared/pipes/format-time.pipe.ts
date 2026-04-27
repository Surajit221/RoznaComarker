import { Pipe, PipeTransform } from '@angular/core';

/**
 * Transforms a duration in seconds into a human-readable string.
 * Examples: 45 → "45s"  |  154 → "2m 34s"  |  120 → "2m"
 */
@Pipe({ name: 'formatTime', standalone: true })
export class FormatTimePipe implements PipeTransform {
  transform(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '0s';
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  }
}
