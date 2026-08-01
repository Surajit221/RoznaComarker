import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { FeedbackApiService } from './feedback-api.service';

describe('FeedbackApiService teacher comments', () => {
  let service: FeedbackApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FeedbackApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('PATCHes only teacherComments to the environment-based endpoint', async () => {
    const pending = service.updateTeacherComments('submission 1', 'Line one\nLine two');
    const request = http.expectOne(`${environment.apiUrl}/feedback/submission%201/teacher-comments`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ teacherComments: 'Line one\nLine two' });
    request.flush({ success: true, data: {
      submissionId: 'submission 1', teacherComments: 'Line one\nLine two',
      teacherCommentsUpdatedAt: '2026-07-26T00:00:00.000Z', teacherCommentsUpdatedBy: 'teacher-1'
    } });
    expect((await pending).teacherComments).toBe('Line one\nLine two');
  });

  it('does not introduce a hardcoded localhost endpoint', () => {
    expect(FeedbackApiService.prototype.updateTeacherComments.toString()).not.toContain('localhost');
  });
});
