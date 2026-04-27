import { Pipe, PipeTransform } from '@angular/core';

/**
 * Transforms a full name into uppercase initials (first + last word).
 * Examples: "John Doe" → "JD"  |  "Alice" → "A"  |  null → "?"
 */
@Pipe({ name: 'initials', standalone: true })
export class InitialsPipe implements PipeTransform {
  transform(name: string | null | undefined): string {
    if (!name?.trim()) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
}
