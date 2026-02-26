export type GradingScale = 'score_0_100' | 'grade_a_f' | 'pass_fail';

const DEFAULT_SCALE: GradingScale = 'score_0_100';

const PASS_THRESHOLD = 60;

const GRADE_THRESHOLDS: Array<{ min: number; label: 'A' | 'B' | 'C' | 'D' | 'F' }> = [
  { min: 90, label: 'A' },
  { min: 80, label: 'B' },
  { min: 70, label: 'C' },
  { min: 60, label: 'D' },
  { min: 0, label: 'F' }
];

function clampScore100(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function normalizeScale(scale: unknown): GradingScale {
  if (scale === 'score_0_100' || scale === 'grade_a_f' || scale === 'pass_fail') return scale;
  return DEFAULT_SCALE;
}

export function gradeLetterFromScore100(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  const s = clampScore100(score);
  for (const t of GRADE_THRESHOLDS) {
    if (s >= t.min) return t.label;
  }
  return 'F';
}

export function passFailFromScore100(score: number): 'Pass' | 'Fail' {
  const s = clampScore100(score);
  return s >= PASS_THRESHOLD ? 'Pass' : 'Fail';
}

export function formatGradingDisplay(score: number, gradingScale?: GradingScale | string): {
  gradingScale: GradingScale;
  score100: number;
  displayText: string;
  badgeText: string;
} {
  const scale = normalizeScale(gradingScale);
  const score100 = clampScore100(score);

  if (scale === 'score_0_100') {
    const scoreText = `${Math.round(score100 * 10) / 10} / 100`;
    return {
      gradingScale: scale,
      score100,
      displayText: scoreText,
      badgeText: gradeLetterFromScore100(score100)
    };
  }

  if (scale === 'grade_a_f') {
    const g = gradeLetterFromScore100(score100);
    return {
      gradingScale: scale,
      score100,
      displayText: g,
      badgeText: g
    };
  }

  const pf = passFailFromScore100(score100);
  return {
    gradingScale: scale,
    score100,
    displayText: pf,
    badgeText: pf
  };
}
