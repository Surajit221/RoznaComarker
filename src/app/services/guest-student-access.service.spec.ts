import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { GuestStudentAccess } from './guest-student-access.service';

describe('GuestStudentAccess', () => {
  let access: GuestStudentAccess;
  const id = '507f1f77bcf86cd799439011';
  const token = 'A'.repeat(43);
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [GuestStudentAccess, provideHttpClient(), provideHttpClientTesting()] });
    access = TestBed.inject(GuestStudentAccess);
    access.submissionId = id; access.token = token;
    sessionStorage.clear();
  });
  afterEach(() => sessionStorage.clear());
  it('restores refresh access only for this submission and this short-lived tab session', () => {
    expect(access.restoreReturnToken(id, token)).toBe(token);
    expect(access.restoreReturnToken(id, null)).toBe(token);
    expect(access.restoreReturnToken('another-submission', null)).toBe('');
    sessionStorage.setItem(`comarker:guest-return:${id}`, JSON.stringify({ token, until: Date.now() - 1 }));
    expect(access.restoreReturnToken(id, null)).toBe('');
  });
  it('clears rejected access and never sends its bearer to another origin or submission', () => {
    access.restoreReturnToken(id, token);
    expect(access.mediaHeaders(access.url('media/file/page.png')).get('X-Guest-Token')).toBe(token);
    expect(access.mediaHeaders('https://unrelated.example/image.png').has('X-Guest-Token')).toBeFalse();
    expect(access.mediaHeaders(access.url('media/file/page.png').replace(id, 'another-submission')).has('X-Guest-Token')).toBeFalse();
    access.forgetReturnToken();
    expect(access.restoreReturnToken(id, null)).toBe('');
    expect(access.token).toBe('');
  });
});
