import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  httpTestingProviders,
  routedComponentProviders,
  verifyHttpRequestsAfterEach,
} from '../../../../testing/standalone-test-providers';
import { countWorksheetActivityQuestions, WorksheetCreatePage } from './worksheet-create';

describe('WorksheetCreatePage extraction flow', () => {
  it('counts every question across split mixed-type activities', () => {
    expect(countWorksheetActivityQuestions([
      { type: 'multipleChoice', data: { questions: [{ id: 'q1' }, { id: 'q10' }, { id: 'q14' }] } },
      { type: 'fillBlanks', data: { sentences: [{ id: 'q4' }, { id: 'q11' }, { id: 'q13' }] } },
      { type: 'trueFalse', data: { questions: [{ id: 'q7' }, { id: 'q12' }] } },
      { type: 'shortAnswer', data: { questions: [{ id: 'q9' }, { id: 'q15' }] } },
    ])).toBe(10);
  });
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorksheetCreatePage],
      providers: [...httpTestingProviders, ...routedComponentProviders()],
    }).compileComponents();
  });

  afterEach(() => {
    verifyHttpRequestsAfterEach();
    TestBed.resetTestingModule();
  });

  function setup() {
    const fixture = TestBed.createComponent(WorksheetCreatePage);
    const component = fixture.componentInstance;
    component.activeTab = 'extract';
    component.selectedFile = new File(['worksheet'], 'Spelling Rules.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fixture.detectChanges();
    return { fixture, component, http: TestBed.inject(HttpTestingController) };
  }

  it('accepts DOCX selection', () => {
    const { component } = setup();
    const file = new File(['worksheet'], 'questions.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    component.onFileSelected({ target: { files: [file] } } as unknown as Event);
    expect(component.selectedFile).toBe(file);
    expect(component.errorModal.open).toBeFalse();
  });

  it('sends exactly one request, disables extraction, and opens review on success', () => {
    const { fixture, component, http } = setup();
    component.extractFileStructure();
    component.extractFileStructure();
    fixture.detectChanges();
    const requests = http.match((request) => request.url.endsWith('/worksheets/extract-structure'));
    expect(requests.length).toBe(1);
    expect(requests[0].request.method).toBe('POST');
    const button = fixture.nativeElement.querySelector('button.btn-primary') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
    requests[0].flush({ success: true, fileName: 'Spelling Rules.docx', worksheet: { activities: [] },
      answerKey: {}, extractionDiagnostics: { repairAttempted: true, validationErrors: [], finalFailureCode: null },
      extractedStructure: { title: 'Spelling', description: '', subject: 'English', sections: [] } });
    fixture.detectChanges();
    expect(component.showExtractReview).toBeTrue();
    expect(component.isGenerating).toBeFalse();
  });

  it('shows the server validation message and allows a retry', () => {
    const { component, http } = setup();
    component.extractFileStructure();
    http.expectOne((request) => request.url.endsWith('/worksheets/extract-structure')).flush({
      success: false, code: 'AI_OUTPUT_VALIDATION_FAILED',
      message: "We could read the document, but couldn't structure all worksheet questions reliably. Please review the document formatting or try again.",
    }, { status: 500, statusText: 'Server Error' });
    expect(component.errorModal.message).toContain("couldn't structure all worksheet questions");
    expect(component.isGenerating).toBeFalse();
    component.extractFileStructure();
    http.expectOne((request) => request.url.endsWith('/worksheets/extract-structure')).flush({
      success: true, worksheet: { activities: [] }, answerKey: {},
      extractedStructure: { title: 'Retry', description: '', subject: 'General', sections: [] },
    });
    expect(component.showExtractReview).toBeTrue();
  });

  it('falls back to the safe DOCX parse copy when only a code is returned', () => {
    const { component, http } = setup();
    component.extractFileStructure();
    http.expectOne((request) => request.url.endsWith('/worksheets/extract-structure')).flush(
      { success: false, code: 'WORKSHEET_DOCX_PARSE_FAILED' },
      { status: 400, statusText: 'Bad Request' });
    expect(component.errorModal.message).toContain("couldn't read this Word document");
  });

  it('keeps the file summary and extraction control available at a mobile viewport', () => {
    window.resizeTo(390, 844);
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('.wcp-overlay-file-selected')).toBeTruthy();
    const button = fixture.nativeElement.querySelector('button.btn-primary') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.disabled).toBeFalse();
  });
});
