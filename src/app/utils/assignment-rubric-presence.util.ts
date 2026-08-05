function parseObject(value: unknown): Record<string, any> | null {
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' ? value as Record<string, any> : null;
}

function hasMeaningfulCurrentRubric(value: unknown): boolean {
  const rubric = parseObject(value);
  const criteria = Array.isArray(rubric?.['criteria']) ? rubric!['criteria'] : [];
  return criteria.some((criterion: any) => {
    const title = String(criterion?.name ?? criterion?.title ?? '').trim();
    const weight = Number(criterion?.weight);
    const levels = Array.isArray(criterion?.levels) ? criterion.levels : [];
    const hasLevel = levels.some((level: any) => {
      const label = String(level?.title ?? '').trim();
      const descriptor = String(level?.description ?? '').trim();
      const score = level?.score;
      return (label.length > 0 || descriptor.length > 0)
        && score !== null && score !== ''
        && Number.isFinite(Number(score));
    });
    return title.length > 0 && Number.isFinite(weight) && weight > 0 && hasLevel;
  });
}

function hasMeaningfulLegacyRubric(value: unknown): boolean {
  const rubric = parseObject(value);
  if (!rubric) return false;
  if (hasMeaningfulCurrentRubric(rubric)) return true;

  const levels = Array.isArray(rubric['levels']) ? rubric['levels'] : [];
  const criteria = Array.isArray(rubric['criteria']) ? rubric['criteria'] : [];
  return criteria.some((criterion: any) => {
    const title = String(criterion?.title ?? criterion?.name ?? '').trim();
    const weight = Number(criterion?.weight);
    const cells = Array.isArray(criterion?.cells) ? criterion.cells : [];
    const hasLevel = levels.some((level: any, index: number) => {
      const label = String(level?.title ?? '').trim();
      const descriptor = String(cells[index] ?? '').trim();
      const score = level?.maxPoints ?? level?.score;
      return (label.length > 0 || descriptor.length > 0)
        && score !== null && score !== ''
        && Number.isFinite(Number(score));
    });
    return title.length > 0 && Number.isFinite(weight) && weight > 0 && hasLevel;
  });
}

export function hasMeaningfulAssignmentRubric(assignment: unknown): boolean {
  const value = parseObject(assignment);
  if (!value) return false;
  return hasMeaningfulCurrentRubric(value['rubrics'])
    || hasMeaningfulLegacyRubric(value['rubric']);
}
