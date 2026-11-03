export const TEACHER_NAME_FALLBACK = 'Your teacher';

const usable = (value: unknown): string => {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && !name.includes('@') ? name : '';
};

/**
 * The teacher's name on a student page: the server's teacherDisplayName on a class or assignment. An older response may still carry a teacher
 * object, so its name is accepted during a rollout. An email is never shown, wherever it comes from.
 */
export function teacherDisplayName(owner: unknown): string {
  const value = (owner && typeof owner === 'object' ? owner : {}) as { teacherDisplayName?: unknown; teacher?: { displayName?: unknown; name?: unknown } | string | null };
  const teacher = value.teacher && typeof value.teacher === 'object' ? value.teacher : null;
  return usable(value.teacherDisplayName) || usable(teacher?.displayName) || usable(teacher?.name) || TEACHER_NAME_FALLBACK;
}
