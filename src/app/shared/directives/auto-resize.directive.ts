import { AfterViewInit, Directive, ElementRef, HostListener, inject } from '@angular/core';

@Directive({
  selector: 'textarea[autoResize]',
  standalone: true,
})
export class AutoResizeDirective implements AfterViewInit {
  private readonly el = inject(ElementRef);

  ngAfterViewInit(): void {
    this.adjustHeight();
  }

  @HostListener('input')
  onInput(): void {
    this.adjustHeight();
  }

  /** Resets height then grows to fit scrollHeight */
  private adjustHeight(): void {
    const ta = this.el.nativeElement as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }
}
