import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { SpeakingApiService } from './speaking-api.service';
import { httpTestingProviders, verifyHttpRequestsAfterEach } from '../../testing/standalone-test-providers';

const API = 'http://localhost:5000/api';

describe('SpeakingApiService (teacher: config and speaking assignments)', () => {
  let api: SpeakingApiService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...httpTestingProviders] });
    api = TestBed.inject(SpeakingApiService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(verifyHttpRequestsAfterEach);

  it('config: GET /audio/config; a 404 (feature off) or any error means not enabled', async () => {
    const on = api.getAudioConfig();
    http.expectOne(`${API}/audio/config`).flush({ success: true, data: { enabled: true, maxFileBytes: 41943040, maxDurationSeconds: 420, minDurationSeconds: 5 } });
    expect(await on).toEqual({ enabled: true, maxFileBytes: 41943040, maxDurationSeconds: 420, minDurationSeconds: 5 });
    const off = api.getAudioConfig();
    http.expectOne(`${API}/audio/config`).flush({ success: false, code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    expect(await off).toEqual({ enabled: false });
    const broken = api.getAudioConfig();
    http.expectOne(`${API}/audio/config`).error(new ProgressEvent('error'));
    expect(await broken).toEqual({ enabled: false });
  });

  it('create: POST /assignments with resourceType speaking and the speaking settings (seconds, rubric reference)', async () => {
    const created = api.createSpeakingAssignment({ classId: 'class-1', title: 'Describe your town', instructions: 'Speak for two minutes.', deadline: '2099-01-10',
      showMarksToStudent: true, maxRecordingSeconds: 180, rubricRef: null });
    const req = http.expectOne(`${API}/assignments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ classId: 'class-1', title: 'Describe your town', instructions: 'Speak for two minutes.', deadline: '2099-01-10',
      showMarksToStudent: true, resourceType: 'speaking', speaking: { maxRecordingSeconds: 180, rubricRef: null } });
    req.flush({ success: true, data: { _id: 'a1', resourceType: 'speaking' } });
    expect((await created)._id).toBe('a1');
  });

  it('update: PATCH /assignments/:id with the speaking settings; the rubric reference alone can be patched', async () => {
    const updated = api.updateSpeakingAssignment('a 1', { title: 'New', instructions: 'Text', deadline: '2099-02-01', showMarksToStudent: false, maxRecordingSeconds: 60 });
    const req = http.expectOne(`${API}/assignments/a%201`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ title: 'New', instructions: 'Text', deadline: '2099-02-01', showMarksToStudent: false, speaking: { maxRecordingSeconds: 60 } });
    req.flush({ success: true, data: { _id: 'a 1' } });
    await updated;
    const attach = api.attachRubric('a1', 'r9');
    const patch = http.expectOne(`${API}/assignments/a1`);
    expect(patch.request.body).toEqual({ speaking: { rubricRef: 'r9' } });
    patch.flush({ success: true, data: { _id: 'a1', speaking: { rubricRef: 'r9' } } });
    expect((await attach).speaking?.rubricRef).toBe('r9');
  });
});
