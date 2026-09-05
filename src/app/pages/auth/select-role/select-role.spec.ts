import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { PostAuthNavigationService } from '../../../auth/post-auth-navigation.service';
import { SelectRole } from './select-role';
import { SubscriptionApiService } from '../../../api/subscription-api.service';

describe('SelectRole', () => {
  let fixture: ComponentFixture<SelectRole>;
  let component: SelectRole;
  let auth: jasmine.SpyObj<AuthService>;
  let postAuth: jasmine.SpyObj<PostAuthNavigationService>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj('AuthService', ['setMyRole']);
    postAuth = jasmine.createSpyObj('PostAuthNavigationService', ['navigate']);
    postAuth.navigate.and.resolveTo(true);
    await TestBed.configureTestingModule({
      imports: [SelectRole],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: PostAuthNavigationService, useValue: postAuth },
        { provide: SubscriptionApiService, useValue: { claimReferral: jasmine.createSpy().and.resolveTo({ applied: true }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(SelectRole);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('disables Continue until a role is selected', () => {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.continue-button');
    expect(button.disabled).toBeTrue();
    component.select('teacher');
    fixture.detectChanges();
    expect(button.disabled).toBeFalse();
  });

  it('saves the selected role once and navigates with the refreshed user', async () => {
    const response = { success: true, token: 'new-token', user: { id: '1', email: 't@example.test', role: 'teacher' } };
    auth.setMyRole.and.resolveTo(response);
    component.select('teacher');
    const first = component.continue();
    const second = component.continue();
    await Promise.all([first, second]);
    expect(auth.setMyRole).toHaveBeenCalledOnceWith('teacher');
    expect(postAuth.navigate).toHaveBeenCalledWith(response.user, null);
  });

  it('shows a friendly save error', async () => {
    auth.setMyRole.and.rejectWith({ error: { message: 'Unable to save role' } });
    component.select('student');
    await component.continue();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Unable to save role');
  });
});
