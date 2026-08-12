import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import {
  httpTestingProviders,
  routedComponentProviders,
  verifyHttpRequestsAfterEach,
} from '../../../../testing/standalone-test-providers';
import { WorksheetCreatePage } from './worksheet-create';

describe('WorksheetCreatePage generated HTML isolation', () => {
  afterEach(() => {
    verifyHttpRequestsAfterEach();
    TestBed.resetTestingModule();
  });

  it('renders the generated preview in a maximally restricted sandbox', async () => {
    await TestBed.configureTestingModule({
      imports: [WorksheetCreatePage],
      providers: [...httpTestingProviders, ...routedComponentProviders()],
    }).compileComponents();

    const fixture = TestBed.createComponent(WorksheetCreatePage);
    fixture.componentInstance.htmlWorksheet = '<!doctype html><html><body><div class="worksheet-container">Safe</div></body></html>';
    fixture.componentInstance.htmlWorksheetTitle = 'Safe worksheet';
    fixture.componentInstance.htmlPreviewUrl = TestBed.inject(DomSanitizer)
      .bypassSecurityTrustResourceUrl('about:blank');
    fixture.detectChanges();

    const iframe = fixture.nativeElement.querySelector('iframe.wcp-html-preview-iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.sandbox.contains('allow-scripts')).toBeFalse();
    expect(iframe.sandbox.contains('allow-same-origin')).toBeFalse();
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
  });
});
