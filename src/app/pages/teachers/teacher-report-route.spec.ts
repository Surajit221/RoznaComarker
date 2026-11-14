import { TEACHER_ROUTE } from './teacher.routes';
import { TeacherGuard } from '../../auth/teacher.guard';

describe('teacher routes: assignment report', () => {
  it('serves /teacher/assignment-report/:assignmentId under the teacher guard, lazily loaded', async () => {
    const parent = TEACHER_ROUTE.find((r) => r.path === 'teacher')!;
    expect(parent.canActivate).toContain(TeacherGuard);
    const child = parent.children!.find((r) => r.path === 'assignment-report/:assignmentId')!;
    expect(child).toBeDefined();
    expect(typeof child.loadComponent).toBe('function');
    const component = await (child.loadComponent as () => Promise<unknown>)();
    expect((component as { name: string }).name).toContain('AssignmentReportPage');
  });
});
