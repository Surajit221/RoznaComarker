import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { AssignmentApiService } from './assignment-api.service';

describe('AssignmentApiService stale evaluation workflow', () => {
  let service: AssignmentApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AssignmentApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the stale count and starts the teacher bulk endpoint once', async () => {
    const summaryPromise = service.getStaleEvaluationSummary('assignment-1');
    const summaryRequest = http.expectOne(
      `${environment.apiUrl}/assignments/assignment-1/evaluations/stale-summary`
    );
    expect(summaryRequest.request.method).toBe('GET');
    summaryRequest.flush({ success: true, data: {
      assignmentId: 'assignment-1', eligibleCount: 2, skippedOverrideCount: 1,
      skippedProcessingCount: 0, skippedNotReadyCount: 0
    } });
    expect((await summaryPromise).eligibleCount).toBe(2);

    const startPromise = service.retryStaleEvaluations('assignment-1');
    const startRequest = http.expectOne(
      `${environment.apiUrl}/assignments/assignment-1/evaluations/retry-stale`
    );
    expect(startRequest.request.method).toBe('POST');
    startRequest.flush({ success: true, data: {
      assignmentId: 'assignment-1', eligibleCount: 2, startedCount: 2,
      skippedOverrideCount: 1, skippedProcessingCount: 0, skippedNotReadyCount: 0,
      submissionIds: ['submission-1', 'submission-2']
    } });
    expect((await startPromise).startedCount).toBe(2);
  });
});
