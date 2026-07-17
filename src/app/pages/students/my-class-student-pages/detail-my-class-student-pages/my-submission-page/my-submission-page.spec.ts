import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MySubmissionPage } from './my-submission-page';

describe('MySubmissionPage', () => {
  let component: MySubmissionPage;
  let fixture: ComponentFixture<MySubmissionPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MySubmissionPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MySubmissionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('resets student sections independently for a new submission', () => {
    (component as any).resetSectionStates();
    expect(component.scoreState).toBe('loading');
    expect(component.transcriptState).toBe('loading');
    expect(component.correctionsState).toBe('loading');
    expect(component.feedbackState).toBe('loading');
    expect(component.aiFeedbackState).toBe('loading');
  });

  it('preserves valid loaded zero corrections', () => {
    component.correctionsState = 'loaded';
    component.feedback = { correctionStatistics: { content: 0, grammar: 0, organization: 0, vocabulary: 0, mechanics: 0 } } as any;
    expect(component.contentIssuesCount).toBe(0);
    expect(component.grammarIssuesCount).toBe(0);
  });

  it('allows feedback to remain loading after transcript content is ready', () => {
    component.transcriptState = 'loaded';
    component.feedbackState = 'loading';
    expect(component.transcriptState).toBe('loaded');
    expect(component.feedbackState).toBe('loading');
  });
});
