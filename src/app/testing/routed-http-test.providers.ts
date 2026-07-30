import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

export function routedHttpTestProviders(
  params: Record<string, string> = {},
  queryParams: Record<string, string> = {},
): Array<Provider | EnvironmentProviders> {
  const params$ = new BehaviorSubject(params);
  const queryParams$ = new BehaviorSubject(queryParams);
  const route = {
    params: params$.asObservable(),
    queryParams: queryParams$.asObservable(),
    paramMap: new BehaviorSubject(convertToParamMap(params)).asObservable(),
    queryParamMap: new BehaviorSubject(convertToParamMap(queryParams)).asObservable(),
    data: new BehaviorSubject({}).asObservable(),
    url: new BehaviorSubject([]).asObservable(),
    snapshot: {
      params,
      queryParams,
      paramMap: convertToParamMap(params),
      queryParamMap: convertToParamMap(queryParams),
      data: {},
      url: [],
    },
  };

  return [
    provideRouter([]),
    provideHttpClient(),
    provideHttpClientTesting(),
    { provide: ActivatedRoute, useValue: route },
  ];
}
