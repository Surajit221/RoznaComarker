import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { AuthService } from '../app/auth/auth.service';
import { Auth } from '@angular/fire/auth';

type TestProvider = Provider | EnvironmentProviders;

export const httpTestingProviders: TestProvider[] = [
  provideHttpClient(),
  provideHttpClientTesting()
];

export function verifyHttpRequestsAfterEach(): void {
  TestBed.inject(HttpTestingController).verify();
}

export function routedComponentProviders(overrides: Record<string, string> = {}): TestProvider[] {
  const params = {
    id: 'entity-1', classId: 'class-1', assignmentId: 'assignment-1',
    submissionId: 'submission-1', studentId: 'student-1', setId: 'set-1', ...overrides
  };
  const paramMap = convertToParamMap(params);
  const queryParamMap = convertToParamMap({});
  return [
    provideRouter([]),
    { provide: ActivatedRoute, useValue: {
      snapshot: { params, queryParams: {}, paramMap, queryParamMap },
      paramMap: of(paramMap), queryParamMap: of(queryParamMap),
      params: of(params), queryParams: of({}), data: of({}), fragment: of(null)
    } }
  ];
}

export function authenticatedUserProviders(role: 'student' | 'teacher'): Provider[] {
  const profile = { id: `${role}-1`, _id: `${role}-1`, email: `${role}@example.test`,
    displayName: `Test ${role}`, role };
  return [{ provide: Auth, useValue: { currentUser: { uid: `${role}-firebase-1`, email: profile.email,
    getIdToken: () => Promise.resolve('firebase-test-token') } } },
  { provide: AuthService, useValue: {
    getBackendJwt: () => 'test-jwt', getCurrentUser: () => profile,
    getMeProfile: () => Promise.resolve(profile), updateMeProfile: () => Promise.resolve(profile),
    uploadMyAvatar: () => Promise.resolve({ user: profile }), logout: () => Promise.resolve(),
    currentUser$: new BehaviorSubject(profile), user$: new BehaviorSubject(profile)
  } }];
}

export function signedOutUserProviders(): Provider[] {
  return [{ provide: Auth, useValue: { currentUser: null } },
  { provide: AuthService, useValue: {
    getBackendJwt: () => null, getCurrentUser: () => null,
    getMeProfile: () => Promise.resolve(null), logout: () => Promise.resolve(),
    currentUser$: new BehaviorSubject(null), user$: new BehaviorSubject(null)
  } }];
}
