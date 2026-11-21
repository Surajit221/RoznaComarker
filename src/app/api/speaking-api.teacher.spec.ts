import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { SpeakingApiService } from './speaking-api.service';
import { httpTestingProviders, verifyHttpRequestsAfterEach } from '../../testing/standalone-test-providers';

const API = 'http://localhost:5000/api';

describe('SpeakingApiService (teacher submission view, marking retry, private audio)', () => {
  let api: SpeakingApiService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...httpTestingProviders] });
    api = TestBed.inject(SpeakingApiService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(verifyHttpRequestsAfterEach);

  it('job view: GET /speaking/submissions/:id; retry marking: POST .../retry-assessment returns the result', async () => {
    const view = api.getTeacherSubmission('s 1');
    http.expectOne(`${API}/speaking/submissions/s%201`).flush({ success: true, data: { id: 's 1', studentName: 'Ana' } });
    expect((await view).studentName).toBe('Ana');
    const retried = api.retryAssessment('s1');
    const req = http.expectOne(`${API}/speaking/submissions/s1/retry-assessment`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data: { submissionId: 's1', state: 'assessing' } });
    expect((await retried).state).toBe('assessing');
  });

  it('audio comes through the signed-in client as a blob (never a public link): media for playing, download for the teacher', async () => {
    const media = api.getRecordingBlob('s1');
    const play = http.expectOne(`${API}/audio/submissions/s1/media`);
    expect(play.request.responseType).toBe('blob');
    play.flush(new Blob(['ID3'], { type: 'audio/mpeg' }));
    expect((await media).type).toBe('audio/mpeg');
    const file = api.downloadRecordingBlob('s1');
    const download = http.expectOne(`${API}/audio/submissions/s1/download`);
    expect(download.request.responseType).toBe('blob');
    download.flush(new Blob(['ID3'], { type: 'audio/mpeg' }));
    expect((await file).size).toBe(3);
  });
});
