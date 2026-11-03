import { TEACHER_NAME_FALLBACK, teacherDisplayName } from './teacher-display-name.util';

describe('teacherDisplayName', () => {
  it('reads the name the server sends students', () => {
    expect(teacherDisplayName({ teacherDisplayName: 'Ms Rahman' })).toBe('Ms Rahman');
  });
  it('accepts an older response during a rollout, by name only', () => {
    expect(teacherDisplayName({ teacher: { displayName: 'Ms Rahman', email: 'r@example.com' } })).toBe('Ms Rahman');
    expect(teacherDisplayName({ teacher: { name: 'Ms Rahman', email: 'r@example.com' } })).toBe('Ms Rahman');
  });
  it('never returns an email, wherever it comes from', () => {
    expect(teacherDisplayName({ teacher: { email: 'r@example.com' } })).toBe(TEACHER_NAME_FALLBACK);
    expect(teacherDisplayName({ teacher: { displayName: 'r@example.com' } })).toBe(TEACHER_NAME_FALLBACK);
    expect(teacherDisplayName({ teacherDisplayName: 'r@example.com' })).toBe(TEACHER_NAME_FALLBACK);
  });
  it('falls back on anything else', () => {
    for (const value of [null, undefined, 'a1', {}, { teacher: 'a1' }, { teacherDisplayName: '   ' }]) expect(teacherDisplayName(value)).toBe('Your teacher');
  });
});
