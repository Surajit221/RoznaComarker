export type DashboardSubmissionStatus = 'submitted' | 'reviewed';

export type DashboardStudentLite = {
  id: string;
  name: string;
  image: string;
};

export type DashboardClassLite = {
  id: string;
  title: string;
};

export type DashboardAssignmentLite = {
  id: string;
  title: string;
};

export type DashboardSubmission = {
  id: string;
  student: DashboardStudentLite;
  class: DashboardClassLite;
  assignment: DashboardAssignmentLite;
  score: number;
  status: DashboardSubmissionStatus;
  submittedAt: string;
};

export type TeacherDashboardStats = {
  pendingCount: number;
  totalStudents: number;
  avgScore: number;
  activeClasses: number;
};

export type TeacherDashboardClassCard = {
  id: string;
  title: string;
  studentsCount: number;
  deadlinesTodayCount: number;
};

export type TeacherDashboardNeedsAttentionItem = {
  studentId: string;
  studentName: string;
  studentInitial: string;
  avgScore: number;
};
