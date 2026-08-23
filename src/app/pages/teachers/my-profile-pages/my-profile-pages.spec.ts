import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { MyProfilePages } from './my-profile-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../testing/standalone-test-providers';

describe('MyProfilePages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: MyProfilePages;
  let fixture: ComponentFixture<MyProfilePages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyProfilePages], providers: [...routedComponentProviders(), ...httpTestingProviders,
        ...authenticatedUserProviders('teacher')]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyProfilePages);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await Promise.resolve();
    TestBed.inject(HttpTestingController).expectOne('http://localhost:5000/api/classes/mine')
      .flush({ success: true, data: [] });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows success after AI settings are accepted by the profile endpoint', async () => {
    const update = spyOn((component as any).auth, 'updateMeProfile').and.resolveTo({});
    const toast = spyOn((component as any).alert, 'showToast');
    component.aiConfigForm.setValue({
      strictness: 'strict', grammarSpelling: false, coherenceLogic: true, factChecking: false
    });

    await component.onSaveAiConfig();

    expect(update).toHaveBeenCalledWith({ aiConfig: { strictness: 'strict', checks: {
      grammarSpelling: false, coherenceLogic: true, factChecking: false
    } } });
    expect(toast).toHaveBeenCalledWith('AI settings updated');
    expect(component.isSavingAiConfig).toBeFalse();
  });

  it('shows the backend error and clears loading when AI settings are rejected', async () => {
    spyOn((component as any).auth, 'updateMeProfile').and.rejectWith({ error: { message: 'Invalid settings' } });
    const showError = spyOn((component as any).alert, 'showError');

    await component.onSaveAiConfig();

    expect(showError).toHaveBeenCalledWith('Failed to update AI settings', 'Invalid settings');
    expect(component.isSavingAiConfig).toBeFalse();
  });

  it('reports a persisted save as successful when eager propagation is pending', async () => {
    spyOn((component as any).auth, 'updateMeProfile').and.resolveTo({
      evaluationPropagation: { status: 'pending', policyHash: 'policy-hash' }
    });
    const toast = spyOn((component as any).alert, 'showToast');

    await component.onSaveAiConfig();

    expect(toast).toHaveBeenCalledWith(
      'AI settings updated; existing evaluations will refresh when reopened'
    );
  });
});
