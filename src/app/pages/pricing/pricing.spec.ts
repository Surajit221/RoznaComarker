import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { BackendPlan, PlansApiService } from '../../api/plans-api.service';
import { AuthService } from '../../auth/auth.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { routedComponentProviders } from '../../../testing/standalone-test-providers';
import { PricingComponent } from './pricing';

const plans: BackendPlan[] = [
  {
    name: 'Custom', slug: 'custom', price: null, currency: 'USD', billingInterval: null, popular: false,
    features: {
      maxClasses: null, maxStudents: null, essayAnalysesPerMonth: null, storageMB: null,
      aiFlashcards: true, aiFlashcardsLimit: null, aiWorksheets: true, aiWorksheetsLimit: null,
      adaptiveLearning: true, adaptiveLearningLimit: null, priorityAIProcessing: true,
      analyticsAccess: true, dedicatedSupport: true
    },
    display: {
      title: 'Custom', description: 'Advanced features for schools and organizations.',
      priceLabel: 'Custom', cta: 'Contact Us'
    }
  },
  {
    name: 'Free', slug: 'free', price: 0, currency: 'USD', billingInterval: 'month', popular: false,
    features: {
      maxClasses: 5, maxStudents: 50, essayAnalysesPerMonth: 100, storageMB: 500,
      aiFlashcards: true, aiFlashcardsLimit: 10, aiWorksheets: true, aiWorksheetsLimit: 10,
      adaptiveLearning: true, adaptiveLearningLimit: 10, priorityAIProcessing: false,
      analyticsAccess: false, dedicatedSupport: false
    },
    display: {
      title: 'Free', description: 'Perfect to try the workflow.', priceLabel: '$0', cta: 'Get Started'
    }
  },
  {
    name: 'Starter Monthly', slug: 'starter_monthly', price: 9.99, currency: 'USD',
    billingInterval: 'month', popular: true,
    features: {
      maxClasses: 20, maxStudents: 500, essayAnalysesPerMonth: 1000, storageMB: 2048,
      aiFlashcards: true, aiFlashcardsLimit: null, aiWorksheets: true, aiWorksheetsLimit: null,
      adaptiveLearning: true, adaptiveLearningLimit: null, priorityAIProcessing: true,
      analyticsAccess: true, dedicatedSupport: false
    },
    display: {
      title: 'Starter Monthly', description: 'Best for active teachers.',
      priceLabel: '$9.99', cta: 'Upgrade Now'
    }
  }
];

describe('PricingComponent', () => {
  async function create(
    getActivePlans: () => Promise<BackendPlan[]>,
    role: string | null = null
  ): Promise<ComponentFixture<PricingComponent>> {
    await TestBed.configureTestingModule({
      imports: [PricingComponent],
      providers: [
        ...routedComponentProviders(),
        { provide: PlansApiService, useValue: { getActivePlans } },
        { provide: AuthService, useValue: { getBackendRole: () => role } },
        { provide: SubscriptionApiService, useValue: {
          getMySubscription: () => Promise.resolve({ billing: null }),
          createCustomerPortal: () => Promise.resolve({ url: 'https://billing.stripe.test' })
        } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PricingComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders canonical plans, product features, ordering, price, badge, and storage conversion', async () => {
    const fixture = await create(() => Promise.resolve(plans));
    await fixture.whenStable();
    fixture.detectChanges();

    const cards = Array.from(
      fixture.nativeElement.querySelectorAll('[data-plan-slug]') as NodeListOf<HTMLElement>
    );
    const text = fixture.nativeElement.textContent;

    expect(cards.map((card) => card.dataset['planSlug'])).toEqual([
      'free', 'starter_monthly', 'custom'
    ]);
    expect(text).toContain('Free');
    expect(text).toContain('Classes: 5');
    expect(text).toContain('Students: 50');
    expect(text).toContain('Essay analyses/month: 100');
    expect(text).toContain('Starter Monthly');
    expect(text).toContain('$9.99');
    expect(text).toContain('Essay analyses/month: 1000');
    expect(text).toContain('AI Flashcards: Included');
    expect(text).toContain('AI Worksheets: Included');
    expect(text).toContain('Adaptive Learning: Included');
    expect(text).toContain('Storage: 2 GB');
    expect(text).toContain('Popular');
    expect(text).toContain('Custom');
    expect(text).toContain('Dedicated support: Included');
    expect(text).not.toContain('AI tokens');
  });

  it('keeps a stable loading layout while the API request is pending', async () => {
    let resolvePlans!: (value: BackendPlan[]) => void;
    const pending = new Promise<BackendPlan[]>((resolve) => { resolvePlans = resolve; });
    const fixture = await create(() => pending);

    expect(fixture.nativeElement.querySelector('[aria-label="Loading plans"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.min-h-\\[30rem\\]').length).toBe(3);

    resolvePlans(plans);
    await fixture.whenStable();
  });

  it('shows a sanitized error state', async () => {
    const fixture = await create(() => Promise.reject(new Error('database password')));
    await fixture.whenStable();
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('Plans are temporarily unavailable');
    expect(alert.textContent).not.toContain('database password');
  });

  it('prevents a student from triggering the upgrade CTA', async () => {
    const fixture = await create(() => Promise.resolve(plans), 'student');
    await fixture.whenStable();
    fixture.detectChanges();

    const starter = fixture.nativeElement.querySelector('[data-plan-slug="starter_monthly"]');
    const button = starter.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
    expect(button.textContent).toContain('Upgrade Now');
  });

  it('navigates a Free teacher from Starter Upgrade Now to the guarded checkout route', async () => {
    const fixture = await create(() => Promise.resolve(plans), 'teacher');
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const starterPlan = plans.find((plan) => plan.slug === 'starter_monthly')!;
    await fixture.componentInstance.onPlanAction(starterPlan);
    expect(navigate).toHaveBeenCalledWith(['/checkout/starter']);
  });

  it('keeps the responsive one/two/three-column card grid classes', async () => {
    const fixture = await create(() => Promise.resolve(plans));
    await fixture.whenStable();
    fixture.detectChanges();

    const grid = fixture.nativeElement.querySelector('.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3');
    expect(grid).not.toBeNull();
  });
});
