import { policyPropagationMessage } from './policy-propagation-message.util';
describe('policy propagation messaging', () => {
  it('reports pending status without promising automatic evaluation', () => {
    expect(policyPropagationMessage({ status: 'pending' })).toContain('pending');
    expect(policyPropagationMessage({ status: 'pending' })).toContain('Credits');
    expect(policyPropagationMessage({ status: 'pending' })).not.toContain('refresh when reopened');
  });
  it('reports stale and restored counts truthfully', () => {
    expect(policyPropagationMessage({ status: 'completed', staleCount: 3 })).toContain('3 evaluation(s)');
    expect(policyPropagationMessage({ status: 'completed', restoredCount: 2 })).toContain('2 existing evaluation(s) restored');
  });
});
