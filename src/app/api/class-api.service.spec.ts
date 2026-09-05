import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { CacheService } from '../services/cache.service';
import { ClassApiService, type BackendClass } from './class-api.service';

describe('ClassApiService class-list invalidation', () => {
  let service: ClassApiService;
  let http: HttpTestingController;
  let cache: CacheService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ClassApiService);
    http = TestBed.inject(HttpTestingController);
    cache = TestBed.inject(CacheService);
  });

  afterEach(() => http.verify());

  it('invalidates active and archived status caches after create', async () => {
    cache.set('my-teacher-classes-active', [{ _id: 'old' }]);
    cache.set('my-teacher-classes-archived', [{ _id: 'archived' }]);
    const created = { _id: 'class-2', name: 'Biology', teacher: 'teacher-1', joinCode: 'NEW123',
      isActive: true, status: 'active', createdAt: '2026-09-01', updatedAt: '2026-09-01' } as BackendClass;
    const promise = service.createClass({ name: 'Biology', description: 'Biology class' });
    http.expectOne(`${environment.apiUrl}/classes`).flush({ success: true, data: created });
    await expectAsync(promise).toBeResolvedTo({ ...created, bannerUrl: '' });
    expect(cache.get('my-teacher-classes-active')).toBeNull();
    expect(cache.get('my-teacher-classes-archived')).toBeNull();
  });

  it('invalidates both lists and emits an idempotent class removal after delete', async()=>{
    cache.set('my-teacher-classes-active',[{_id:'class-1'}]);cache.set('my-teacher-classes-archived',[{_id:'class-1'}]);const removed:string[]=[];service.classDeleted$.subscribe(id=>removed.push(id));
    const promise=service.deleteClass('class-1');http.expectOne(`${environment.apiUrl}/classes/class-1`).flush({success:true,data:{_id:'class-1',isActive:false}});await promise;
    expect(removed).toEqual(['class-1']);expect(cache.get('my-teacher-classes-active')).toBeNull();expect(cache.get('my-teacher-classes-archived')).toBeNull();
  });
});
