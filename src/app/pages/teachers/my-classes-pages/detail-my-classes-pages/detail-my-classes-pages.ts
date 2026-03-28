import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalDialog } from '../../../../shared/modal-dialog/modal-dialog';
import { AssignmentForm } from './assignment-form/assignment-form';
import { DialogQrClasses } from './dialog-qr-classes/dialog-qr-classes';
import { DialogViewSubmissions } from './dialog-view-submissions/dialog-view-submissions';
import { InviteStudentsDialog } from '../../../../components/teacher/invite-students-dialog/invite-students-dialog';
import { DeviceService } from '../../../../services/device.service';
import { AppBarBackButton } from '../../../../shared/app-bar-back-button/app-bar-back-button';
import { BottomsheetDialog } from '../../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { AssignmentApiService, type BackendAssignment } from '../../../../api/assignment-api.service';
import { RubricApiService } from '../../../../api/rubric-api.service';
import { AlertService } from '../../../../services/alert.service';
import { ClassApiService, type BackendClassStudent, type BackendClassSummary } from '../../../../api/class-api.service';
import { SubmissionApiService } from '../../../../api/submission-api.service';
import { QrGeneratorService } from '../../../../services/qr-generator.service';
import { RubricDesignerModal } from '../../../../components/teacher/rubric-designer-modal/rubric-designer-modal';
import type { RubricDesigner } from '../../../../models/submission-feedback.model';
import { NotificationRealtimeService } from '../../../../services/notification-realtime.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-detail-my-classes-pages',
  imports: [
    CommonModule,
    ModalDialog,
    AssignmentForm,
    DialogQrClasses,
    DialogViewSubmissions,
    InviteStudentsDialog,
    AppBarBackButton,
    BottomsheetDialog,
    RubricDesignerModal,
  ],
  templateUrl: './detail-my-classes-pages.html',
  styleUrl: './detail-my-classes-pages.css',
})
export class DetailMyClassesPages {
  showDialog = false;
  showDialogSubmission = false;
  showDialogQRClasses = false;
  showInviteDialog = false;
  device = inject(DeviceService);
  private route = inject(ActivatedRoute);
  private assignmentApi = inject(AssignmentApiService);
  private rubricApi = inject(RubricApiService);
  private alert = inject(AlertService);
  private classApi = inject(ClassApiService);
  private submissionApi = inject(SubmissionApiService);
  private qrGenerator = inject(QrGeneratorService);
  private realtime = inject(NotificationRealtimeService);

  private realtimeSub: Subscription | null = null;
  private pollId: number | null = null;
  private pendingSubmissionCountRefresh = false;
  private lastAssignmentsPollAtMs = 0;
  isButtonFabOpen = false;
  openSheetAssignment = false;
  openSheetQr = false;
  openSheetSubmission = false;

  showRubricDialog = false;
  selectedRubricAssignmentId: string | null = null;
  selectedRubricDesigner: RubricDesigner | null = null;
  selectedRubricDefaultTitle = 'Rubric';
  isRubricGenerating = false;
  isRubricAttaching = false;

  classId: string | null = null;
  isLoading = false;

  classSummary: BackendClassSummary | null = null;

  get classTitle(): string {
    return this.classSummary?.name || '';
  }

  get classDescription(): string {
    return this.classSummary?.description || '';
  }

  get classCode(): string {
    const code = this.classSummary?.joinCode;
    return typeof code === 'string' ? code : '';
  }

  get shareLink(): string {
    const code = this.classCode;
    if (!code) return '';
    return this.qrGenerator.generateClassJoinUrl(code);
  }

  get qrValue(): string {
    const code = this.classCode;
    if (!code) return '';
    return this.qrGenerator.generateQrValue(code, true);
  }

  get selectedAssignmentTitle(): string {
    const id = this.selectedAssignmentId;
    if (!id) return '';
    const found = (this.assignments || []).find((a) => a.id === id);
    return found?.title || '';
  }

  selectedAssignmentId: string | null = null;

  selectedAssignmentForEdit: BackendAssignment | null = null;

  private assignmentsById: Record<string, BackendAssignment> = {};

  get assignmentDialogTitle(): string {
    return this.selectedAssignmentForEdit ? 'Edit Assignment' : 'Create New Assignment';
  }

  assignments: Array<{
    id: string;
    title: string;
    dueDate: string;
    submitted: number;
    total: number;
    status: 'pending' | 'in-progress' | 'completed';
  }> = [];

  private studentSubmissionStatsById: Record<string, { assignmentIds: Set<string>; lastActivityMs: number }> = {};

  async ngOnInit() {
    this.classId = this.route.snapshot.paramMap.get('slug');
    await this.loadClassSummary();
    await this.loadStudents();
    await this.loadAssignments();

    this.realtime.connect();

    this.realtimeSub?.unsubscribe();
    this.realtimeSub = this.realtime.notifications$.subscribe((n: any) => {
      if (!n) return;
      
      if (n.type === 'assignment_submitted') {
        const classId = this.classId;
        const eventClassId = n?.data?.classId ? String(n.data.classId) : '';
        if (!classId || !eventClassId || eventClassId !== classId) return;
        const assignmentId = n?.data?.assignmentId ? String(n.data.assignmentId) : '';
        this.scheduleSubmissionCountRefresh(assignmentId);
      }
      
      if (n.type === 'student_joined' || n.event === 'student_joined') {
        const classId = this.classId;
        const eventClassId = n?.data?.classId || n?.classId ? String(n?.data?.classId || n?.classId) : '';
        if (!classId || !eventClassId || eventClassId !== classId) return;
        
        // Refresh students list and class summary when a student joins
        void this.loadStudents(true);
        void this.loadClassSummary(true);
        void this.loadAssignments();
      }
    });

    this.startPolling();
  }

  ngOnDestroy() {
    this.realtimeSub?.unsubscribe();
    this.realtimeSub = null;

    if (this.pollId !== null) {
      window.clearInterval(this.pollId);
      this.pollId = null;
    }
  }

  private scheduleSubmissionCountRefresh(assignmentId: string): void {
    if (this.pendingSubmissionCountRefresh) return;
    this.pendingSubmissionCountRefresh = true;

    window.setTimeout(() => {
      this.pendingSubmissionCountRefresh = false;
      if (assignmentId) {
        void this.refreshAssignmentSubmissionCount(assignmentId);
        return;
      }
      void this.loadAssignments();
    }, 600);
  }

  private startPolling(): void {
    if (this.pollId !== null) return;
    this.pollId = window.setInterval(() => {
      try {
        if (document.visibilityState !== 'visible') return;
      } catch {
        // ignore
      }

      // Refresh class summary + students more frequently so newly joined students show up without reload.
      void this.loadClassSummary(true);
      void this.loadStudents(true);

      const now = Date.now();
      if (!this.lastAssignmentsPollAtMs || now - this.lastAssignmentsPollAtMs >= 60000) {
        this.lastAssignmentsPollAtMs = now;
        void this.loadAssignments();
      }
    }, 15000);
  }

  private async refreshAssignmentSubmissionCount(assignmentId: string): Promise<void> {
    const classId = this.classId;
    if (!classId || !assignmentId) return;

    const idx = (this.assignments || []).findIndex((a) => a.id === assignmentId);
    if (idx < 0) {
      await this.loadAssignments();
      return;
    }

    try {
      const submissions = await this.submissionApi.getSubmissionsByAssignment(assignmentId);
      const totalStudents = this.studentsCount;

      const nextAssignments = [...this.assignments];
      nextAssignments[idx] = {
        ...nextAssignments[idx],
        submitted: (submissions || []).length,
        total: totalStudents
      };
      this.assignments = nextAssignments;

      // Keep student progress stats reasonably fresh for the UI.
      const getStudentIdFromSubmission = (submission: any): string => {
        const s = submission && submission.student ? submission.student : null;
        if (!s) return '';
        if (typeof s === 'string') return s;
        if (typeof s === 'object') {
          const candidate = (s._id || s.id || s.studentId) as any;
          return typeof candidate === 'string' ? candidate : '';
        }
        return '';
      };

      const getSubmissionTimestampMs = (submission: any): number => {
        const raw = submission?.submittedAt || submission?.updatedAt || submission?.createdAt;
        if (!raw) return 0;
        const t = new Date(raw).getTime();
        return Number.isFinite(t) ? t : 0;
      };

      const statsByStudent = { ...(this.studentSubmissionStatsById || {}) } as Record<string, { assignmentIds: Set<string>; lastActivityMs: number }>;
      for (const sub of submissions || []) {
        const studentId = getStudentIdFromSubmission(sub);
        if (!studentId) continue;
        if (!statsByStudent[studentId]) {
          statsByStudent[studentId] = { assignmentIds: new Set<string>(), lastActivityMs: 0 };
        }
        statsByStudent[studentId].assignmentIds.add(assignmentId);
        const t = getSubmissionTimestampMs(sub);
        if (t > statsByStudent[studentId].lastActivityMs) {
          statsByStudent[studentId].lastActivityMs = t;
        }
      }
      this.studentSubmissionStatsById = statsByStudent;
      this.applyStudentStats();
    } catch {
      // If anything goes wrong, fall back to full reload.
      await this.loadAssignments();
    }
  }

  private async loadClassSummary(forceRefresh = false) {
    const classId = this.classId;
    if (!classId) return;
    try {
      this.classSummary = await this.classApi.getClassSummary(classId, { forceRefresh });
    } catch {
      this.classSummary = null;
    }
  }

  async onAssignmentRubricAttachFile(file: File) {
    const assignmentId = this.selectedRubricAssignmentId;
    if (!assignmentId) return;
    if (!file) return;
    if (this.isRubricAttaching) return;

    const name = String((file as any)?.name || '').toLowerCase();
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    if (ext !== '.docx' && ext !== '.xlsx') {
      this.alert.showWarning('Unsupported file', 'Please upload a DOCX or XLSX rubric template.');
      return;
    }

    this.isRubricAttaching = true;
    try {
      this.alert.showToast('Analyzing rubric file...', 'info');
      const parsed = await this.rubricApi.parseRubricTemplate(file);

      const levels = Array.isArray(parsed?.levels) ? parsed.levels : [];
      const criteria = Array.isArray(parsed?.criteria) ? parsed.criteria : [];

      this.selectedRubricDesigner = {
        title: typeof parsed?.title === 'string' && parsed.title.trim().length
          ? parsed.title
          : (this.selectedRubricDefaultTitle || 'Rubric'),
        levels: levels.map((l: any) => ({
          title: String(l?.name || ''),
          maxPoints: Number(l?.score) || 0
        })),
        criteria: criteria.map((c: any) => ({
          title: String(c?.title || ''),
          cells: (Array.isArray(c?.descriptions) ? c.descriptions : []).map((x: any) => String(x ?? ''))
        }))
      };

      this.alert.showToast('Rubric parsed', 'success');
    } catch (err: any) {
      this.alert.showError('Attach rubric failed', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isRubricAttaching = false;
    }
  }

  private mapAssignment(a: BackendAssignment) {
    const deadline = a.deadline ? new Date(a.deadline) : null;
    const dueDate = deadline ? deadline.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : '';
    const status: 'pending' | 'in-progress' | 'completed' = deadline && deadline.getTime() < Date.now() ? 'completed' : 'pending';

    return {
      id: a._id,
      title: a.title,
      dueDate,
      submitted: 0,
      total: 0,
      status
    };
  }

  async loadAssignments() {
    const classId = this.classId;
    if (!classId) return;

    if (this.isLoading) return;
    this.isLoading = true;
    try {
      const assignments = await this.assignmentApi.getClassAssignments(classId);

      this.assignmentsById = (assignments || []).reduce((acc, a) => {
        acc[a._id] = a;
        return acc;
      }, {} as Record<string, BackendAssignment>);

      this.assignments = (assignments || []).map((a) => this.mapAssignment(a));

      // fill in submission stats
      const totalStudents = this.studentsCount;
      const statsByStudent: Record<string, { assignmentIds: Set<string>; lastActivityMs: number }> = {};

      const getStudentIdFromSubmission = (submission: any): string => {
        const s = submission && submission.student ? submission.student : null;
        if (!s) return '';
        if (typeof s === 'string') return s;
        if (typeof s === 'object') {
          const candidate = (s._id || s.id || s.studentId) as any;
          return typeof candidate === 'string' ? candidate : '';
        }
        return '';
      };

      const getSubmissionTimestampMs = (submission: any): number => {
        const raw = submission?.submittedAt || submission?.updatedAt || submission?.createdAt;
        if (!raw) return 0;
        const t = new Date(raw).getTime();
        return Number.isFinite(t) ? t : 0;
      };

      await Promise.all(
        this.assignments.map(async (item) => {
          try {
            const submissions = await this.submissionApi.getSubmissionsByAssignment(item.id);
            item.submitted = (submissions || []).length;
            item.total = totalStudents;

            for (const sub of submissions || []) {
              const studentId = getStudentIdFromSubmission(sub);
              if (!studentId) continue;
              if (!statsByStudent[studentId]) {
                statsByStudent[studentId] = { assignmentIds: new Set<string>(), lastActivityMs: 0 };
              }
              statsByStudent[studentId].assignmentIds.add(item.id);
              const t = getSubmissionTimestampMs(sub);
              if (t > statsByStudent[studentId].lastActivityMs) {
                statsByStudent[studentId].lastActivityMs = t;
              }
            }
          } catch {
            item.submitted = 0;
            item.total = totalStudents;
          }
        })
      );

      this.studentSubmissionStatsById = statsByStudent;
      this.applyStudentStats();
    } catch (err: any) {
      this.alert.showError('Failed to load assignments', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  async onAssignmentCreated(_created: BackendAssignment) {
    this.closeDialog();
    this.onCloseCreateAssignment();
    if (this.classId) {
      this.classApi.invalidateClassSummary(this.classId);
    }
    this.classApi.invalidateTeacherClassesList();
    await this.loadAssignments();

    const assignmentId = _created && _created._id ? String(_created._id) : '';
    if (!assignmentId) return;

    const ok = await this.alert.showConfirm(
      'Add rubric now?',
      'Do you want to add a rubric for this assignment now?',
      'Yes, add rubric',
      'Not now'
    );
    if (!ok) return;

    await this.openRubricForAssignment(assignmentId);
  }

  onOpenRubric(assignmentId: string) {
    this.openRubricForAssignment(assignmentId);
  }

  private async openRubricForAssignment(assignmentId: string) {
    let a = this.assignmentsById[assignmentId];

    try {
      const fresh = await this.assignmentApi.getAssignmentByIdForTeacher(assignmentId);
      if (fresh && fresh._id) {
        this.assignmentsById[fresh._id] = fresh;
        a = fresh;
      }
    } catch (err: any) {
      const msg = err?.error?.message || err?.message || 'Please try again';
      this.alert.showError('Failed to load rubric', msg);
      return;
    }

    if (!a) {
      this.alert.showWarning('Not found', 'Assignment not found.');
      return;
    }

    this.selectedRubricAssignmentId = assignmentId;
    this.selectedRubricDefaultTitle = a.title ? `Rubric: ${a.title}` : 'Rubric';
    this.selectedRubricDesigner = this.parseRubricDesignerFromAssignment(a);
    this.showRubricDialog = true;
  }

  closeRubricDialog() {
    this.showRubricDialog = false;
    this.selectedRubricAssignmentId = null;
    this.selectedRubricDesigner = null;
    this.isRubricGenerating = false;
  }

  async onAssignmentRubricGenerateAi(prompt: string) {
    const assignmentId = this.selectedRubricAssignmentId;
    if (!assignmentId) return;
    if (this.isRubricGenerating) return;

    const p = String(prompt || '').trim();
    if (!p) {
      this.alert.showWarning('Prompt required', 'Please enter a prompt to generate a rubric.');
      return;
    }

    this.isRubricGenerating = true;
    try {
      const designer = await this.assignmentApi.generateRubricDesignerFromPrompt(assignmentId, p);
      this.selectedRubricDesigner = this.normalizeRubricDesigner(designer, this.selectedRubricDefaultTitle);
      this.alert.showToast('Rubric generated', 'success');
    } catch (err: any) {
      this.alert.showError('Generate Rubric failed', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isRubricGenerating = false;
    }
  }

  async onSaveAssignmentRubric(designer: RubricDesigner) {
    const assignmentId = this.selectedRubricAssignmentId;
    if (!assignmentId) return;
    if (!designer) return;

    try {
      const normalizedDesigner = this.normalizeRubricDesigner(designer, this.selectedRubricDefaultTitle);
      const rubrics = this.toAssignmentRubrics(normalizedDesigner);

      const updated = await this.assignmentApi.updateAssignment(assignmentId, {
        rubrics,
        rubric: normalizedDesigner
      });
      if (updated && updated._id) {
        this.assignmentsById[updated._id] = updated;
      }
      this.alert.showToast('Rubric saved', 'success');
      this.closeRubricDialog();
      await this.loadAssignments();
    } catch (err: any) {
      this.alert.showError('Save rubric failed', err?.error?.message || err?.message || 'Please try again');
    }
  }

  private parseRubricDesignerFromAssignment(a: BackendAssignment): RubricDesigner | null {
    const fromRubrics = this.parseRubricDesignerFromRubricsField((a as any)?.rubrics, a.title);
    if (fromRubrics) return this.normalizeRubricDesigner(fromRubrics, a.title ? `Rubric: ${a.title}` : 'Rubric');
    const legacy = this.parseLegacyRubricDesigner((a as any)?.rubric, a.title);
    return legacy ? this.normalizeRubricDesigner(legacy, a.title ? `Rubric: ${a.title}` : 'Rubric') : null;
  }

  private normalizeRubricDesigner(input: any, defaultTitle: string): RubricDesigner {
    const d = input && typeof input === 'object' ? input : {};
    const titleRaw = typeof d.title === 'string' ? d.title : '';
    const title = titleRaw.trim().length ? titleRaw.trim() : String(defaultTitle || 'Rubric');

    const levelsCandidate = Array.isArray(d.levels)
      ? d.levels
      : (d.levels && typeof d.levels === 'object' ? Object.values(d.levels) : null);

    const criteriaCandidate = Array.isArray(d.criteria)
      ? d.criteria
      : (d.criteria && typeof d.criteria === 'object' ? Object.values(d.criteria) : null);

    const safeCriteriaRaw = Array.isArray(criteriaCandidate) ? criteriaCandidate : [];

    let inferredLevelCount = 0;
    if (safeCriteriaRaw.length) {
      const firstRow: any = safeCriteriaRaw[0] && typeof safeCriteriaRaw[0] === 'object' ? safeCriteriaRaw[0] : {};
      const cellsCandidate = Array.isArray(firstRow.cells)
        ? firstRow.cells
        : (firstRow.cells && typeof firstRow.cells === 'object' ? Object.values(firstRow.cells) : null);
      inferredLevelCount = Array.isArray(cellsCandidate) ? cellsCandidate.length : 0;
    }

    const levelCount = Array.isArray(levelsCandidate)
      ? levelsCandidate.length
      : (inferredLevelCount > 0 ? inferredLevelCount : 4);

    const levelsRaw = Array.isArray(levelsCandidate)
      ? levelsCandidate
      : Array.from({ length: Math.min(6, Math.max(1, levelCount)) }).map(() => ({ title: '', maxPoints: 0 }));

    const levels = levelsRaw
      .map((l: any) => ({
        title: typeof l?.title === 'string' ? String(l.title) : String(l?.title || ''),
        maxPoints: Number(l?.maxPoints) || 0
      }))
      .slice(0, 6);

    const criteria = (safeCriteriaRaw.length ? safeCriteriaRaw : [{ title: '', cells: [] }])
      .map((c: any) => {
        const rawCells = Array.isArray(c?.cells)
          ? c.cells
          : (c?.cells && typeof c.cells === 'object' ? Object.values(c.cells) : []);
        const cells = Array.isArray(rawCells) ? rawCells.map((x: any) => String(x ?? '')) : [];
        const padded = Array.from({ length: levels.length }).map((_, i) => String(cells[i] ?? ''));
        return {
          title: typeof c?.title === 'string' ? String(c.title) : String(c?.title || ''),
          cells: padded
        };
      })
      .slice(0, 50);

    return { title, levels, criteria };
  }

  private parseRubricDesignerFromRubricsField(value: any, assignmentTitle: string): RubricDesigner | null {
    const obj = value && typeof value === 'object' ? value : null;
    const criteriaRaw = Array.isArray(obj?.criteria) ? obj.criteria : null;
    if (!criteriaRaw) return null;

    // Collect a stable ordered list of level titles from the first criteria row.
    const first = criteriaRaw[0] && typeof criteriaRaw[0] === 'object' ? criteriaRaw[0] : null;
    const levelsRaw = Array.isArray((first as any)?.levels) ? (first as any).levels : [];
    if (!levelsRaw.length) return null;

    const levels = levelsRaw.map((l: any) => ({
      title: typeof l?.title === 'string' ? String(l.title) : '',
      maxPoints: Number(l?.score) || 0
    }));

    const criteria = criteriaRaw.map((c: any) => {
      const rowLevels = Array.isArray(c?.levels) ? c.levels : [];
      return {
        title: typeof c?.name === 'string' ? String(c.name) : '',
        cells: levels.map((_lvl: any, i: number) => String(rowLevels[i]?.description ?? ''))
      };
    });

    return {
      title: assignmentTitle ? `Rubric: ${assignmentTitle}` : 'Rubric',
      levels,
      criteria
    };
  }

  private parseLegacyRubricDesigner(value: any, assignmentTitle: string): RubricDesigner | null {
    if (!value) return null;
    const obj = typeof value === 'string' ? this.safeJsonParse(value) : value;
    if (!obj || typeof obj !== 'object') return null;

    const title = typeof (obj as any).title === 'string'
      ? String((obj as any).title)
      : (assignmentTitle ? `Rubric: ${assignmentTitle}` : 'Rubric');
    const levels = Array.isArray((obj as any).levels) ? (obj as any).levels : null;
    const criteria = Array.isArray((obj as any).criteria) ? (obj as any).criteria : null;
    if (!levels || !criteria) return null;

    return {
      title,
      levels: levels.map((l: any) => ({
        title: typeof l?.title === 'string' ? String(l.title) : '',
        maxPoints: Number(l?.maxPoints) || 0
      })),
      criteria: criteria.map((c: any) => ({
        title: typeof c?.title === 'string' ? String(c.title) : '',
        cells: Array.isArray(c?.cells) ? c.cells.map((x: any) => String(x ?? '')) : []
      }))
    };
  }

  private toAssignmentRubrics(designer: RubricDesigner): any {
    const levels = Array.isArray(designer?.levels) ? designer.levels : [];
    const criteria = Array.isArray(designer?.criteria) ? designer.criteria : [];

    return {
      criteria: criteria.map((row: any) => ({
        name: typeof row?.title === 'string' ? row.title : '',
        levels: levels.map((lvl: any, i: number) => ({
          title: typeof lvl?.title === 'string' ? lvl.title : '',
          score: Number(lvl?.maxPoints) || 0,
          description: String(Array.isArray(row?.cells) ? (row.cells[i] ?? '') : '')
        }))
      }))
    };
  }

  private safeJsonParse(value: string): any {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  async onAssignmentUpdated(_updated: BackendAssignment) {
    this.closeDialog();
    this.onCloseCreateAssignment();

    if (this.classId) {
      this.classApi.invalidateClassSummary(this.classId);
    }
    this.classApi.invalidateTeacherClassesList();

    if (_updated?._id) {
      this.assignmentsById[_updated._id] = _updated;
      const mapped = this.mapAssignment(_updated);
      const idx = (this.assignments || []).findIndex((a) => a.id === _updated._id);
      if (idx >= 0) {
        this.assignments[idx] = {
          ...this.assignments[idx],
          ...mapped
        };
      }
    }

    await this.loadAssignments();
  }

  students: Array<{
    id: string;
    name: string;
    image: string;
    status: 'ACTIVE' | 'INVITED';
    submitted: number;
    total: number;
    lastActivity: string;
  }> = [];

  get studentsCount(): number {
    return this.students.length;
  }

  get assignmentsCount(): number {
    return this.assignments.length;
  }

  get totalSubmissions(): number {
    const sum = (this.assignments || []).reduce((acc, a) => acc + (Number.isFinite(a.submitted) ? a.submitted : 0), 0);
    return Number.isFinite(sum) ? sum : 0;
  }

  private mapStudent(s: BackendClassStudent) {
    const joined = s.joinedAt ? new Date(s.joinedAt) : null;
    const lastActivity = joined ? joined.toLocaleDateString() : '';
    return {
      id: s.id,
      name: s.name,
      image: 'img/default-img.png',
      status: (joined ? 'ACTIVE' : 'INVITED') as 'ACTIVE' | 'INVITED',
      submitted: 0,
      total: 0,
      lastActivity
    };
  }

  private applyStudentStats() {
    const totalAssignments = (this.assignments || []).length;
    const stats = this.studentSubmissionStatsById || {};

    this.students = (this.students || []).map((s) => {
      const st = stats[s.id];
      const submitted = st ? st.assignmentIds.size : 0;
      const lastActivity = st && st.lastActivityMs
        ? new Date(st.lastActivityMs).toLocaleDateString()
        : s.lastActivity;

      return {
        ...s,
        submitted,
        total: totalAssignments,
        lastActivity
      };
    });
  }

  private async loadStudents(forceRefresh = false) {
    const classId = this.classId;
    if (!classId) return;
    try {
      const students = await this.classApi.getClassStudents(classId, { forceRefresh });
      this.students = (students || []).map((s) => this.mapStudent(s));
      this.applyStudentStats();
    } catch (err: any) {
      this.alert.showError('Failed to load students', err?.error?.message || err?.message || 'Please try again');
    }
  }

  async onRemoveStudent(studentId: string, studentName: string) {
    const classId = this.classId;
    if (!classId) return;

    const ok = await this.alert.showConfirm(
      'Remove student?',
      `This will remove ${studentName} from this class.`,
      'Yes, remove',
      'Cancel'
    );
    if (!ok) return;

    const prevStudents = [...(this.students || [])];

    try {
      await this.classApi.removeStudentFromClass(classId, studentId);

      this.students = (this.students || []).filter((s) => s.id !== studentId);

      await this.loadClassSummary();
      await this.loadStudents();
      await this.loadAssignments();

      this.alert.showSuccess('Removed', 'Student removed from the class.');
    } catch (err: any) {
      this.students = prevStudents;
      this.alert.showError('Failed to remove student', err?.error?.message || err?.message || 'Please try again');
    }
  }

  constructor(private router: Router) {}

  toMyClasses() {
    this.router.navigate(['/teacher/my-classes']);
  }

  toStudentProfile(studentId: string) {
    this.router.navigate(['/teacher/my-classes/detail/student-profile', studentId], {
      queryParams: {
        classId: this.classId || undefined
      }
    });
  }

  onAddAssignment() {
    this.selectedAssignmentForEdit = null;
    this.showDialog = true;
  }

  onEditAssignment(assignmentId: string) {
    const found = this.assignmentsById[assignmentId];
    if (!found) return;
    this.selectedAssignmentForEdit = found;
    this.showDialog = true;
  }

  onOpenEditAssignmentSheet(assignmentId: string) {
    const found = this.assignmentsById[assignmentId];
    if (!found) return;
    this.selectedAssignmentForEdit = found;
    this.openSheetAssignment = true;
    document.body.classList.add('overflow-hidden');
  }

  async onDeleteAssignment(assignmentId: string) {
    const ok = await this.alert.showConfirm(
      'Delete assignment?',
      'This will remove the assignment from your class.',
      'Yes, delete',
      'Cancel'
    );
    if (!ok) return;

    const prevAssignments = [...(this.assignments || [])];
    const prevAssignmentsById = { ...this.assignmentsById };

    try {
      await this.assignmentApi.deleteAssignment(assignmentId);

      this.assignments = (this.assignments || []).filter((a) => a.id !== assignmentId);
      delete this.assignmentsById[assignmentId];

      if (this.classId) {
        this.classApi.invalidateClassSummary(this.classId);
      }
      this.classApi.invalidateTeacherClassesList();

      this.alert.showSuccess('Deleted', 'Assignment deleted successfully.');
    } catch (err: any) {
      this.assignments = prevAssignments;
      this.assignmentsById = prevAssignmentsById;
      this.alert.showError('Failed to delete assignment', err?.error?.message || err?.message || 'Please try again');
    }
  }

  onOpenSubmission(assignmentId: string) {
    this.selectedAssignmentId = assignmentId;
    this.showDialogSubmission = true;
  }

  onOpenQRClasses() {
    this.showDialogQRClasses = true;
  }

  closeDialog() {
    this.showDialog = false;
    this.selectedAssignmentForEdit = null;
  }

  closeDialogSubmission() {
    this.showDialogSubmission = false;
    this.selectedAssignmentId = null;
  }

  closeDialogQRClasses() {
    this.showDialogQRClasses = false;
  }

  onCloseCreateAssignment() {
    document.body.classList.remove('overflow-hidden');
    this.openSheetAssignment = false;
    this.selectedAssignmentForEdit = null;
  }

  onOpenCreateNewAssignment() {
    document.body.classList.add('overflow-hidden');
    this.openSheetAssignment = true;
  }

  onCloseQR() {
    document.body.classList.remove('overflow-hidden');
    this.openSheetQr = false;
  }

  onOpenQR() {
    document.body.classList.add('overflow-hidden');
    this.openSheetQr = true;
  }

  onCloseSubmission() {
    document.body.classList.remove('overflow-hidden');
    this.openSheetSubmission = false;
    this.selectedAssignmentId = null;
  }

  onOpenSheetSubmission(assignmentId?: string) {
    document.body.classList.add('overflow-hidden');
    this.selectedAssignmentId = assignmentId || null;
    this.openSheetSubmission = true;
  }

  handleGoBack() {
    this.router.navigate(['/student/my-classes']);
  }

  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.alert.showSuccess('Success', 'Copied to clipboard!');
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.alert.showSuccess('Success', 'Copied to clipboard!');
    }
  }

  copyClassLink() {
    this.copyToClipboard(this.shareLink);
  }

  copyClassCode() {
    this.copyToClipboard(this.classCode);
  }

  onInviteStudents() {
    this.showInviteDialog = true;
  }

  onCloseInviteDialog() {
    this.showInviteDialog = false;
  }

  async onSendInvitations(emails: string[]) {
    const classId = this.classId;
    if (!classId) {
      this.alert.showError('Missing class', 'Unable to invite students: class id is missing.');
      return;
    }

    try {
      const result = await this.classApi.inviteStudents(classId, emails);
      
      const { summary } = result;
      let message = `Invitation process completed:\n`;
      message += `• ${summary.invited} invited successfully\n`;
      message += `• ${summary.already_joined} already joined\n`;
      message += `• ${summary.already_invited} already invited\n`;
      message += `• ${summary.errors} errors`;

      if (summary.errors > 0) {
        this.alert.showWarning('Invitations sent with errors', message);
      } else {
        this.alert.showSuccess('Invitations sent', message);
      }

      // Refresh students list to get updated data
      await this.loadStudents();
      await this.loadClassSummary();

    } catch (err: any) {
      const message = err?.error?.message || err?.message || 'Please try again';
      this.alert.showError('Failed to send invitations', message);
    }
  }
}
