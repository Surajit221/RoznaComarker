import type { RubricDesigner } from '../models/submission-feedback.model';
import type { SavedRubricData } from '../api/rubric-api.service';

export function deepClone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function rubricDataToDesigner(data: SavedRubricData, title = 'Rubric'): RubricDesigner {
  const firstLevels = data?.criteria?.[0]?.levels || [];
  return {
    title,
    totalPoints: Number(data?.totalPoints) || 100,
    levels: firstLevels.map((level) => ({ title: level.title, maxPoints: Number(level.score) || 0 })),
    criteria: (data?.criteria || []).map((criterion) => ({
      title: criterion.name,
      weight: Number(criterion.weight) || 0,
      cells: firstLevels.map((_level, index) => String(criterion.levels?.[index]?.description || ''))
    }))
  };
}

export function designerToRubricData(designer: RubricDesigner): SavedRubricData {
  return {
    totalPoints: Number(designer.totalPoints) || 100,
    criteria: designer.criteria.map((criterion) => ({
      name: criterion.title,
      weight: Number(criterion.weight) || 0,
      levels: designer.levels.map((level, index) => ({
        title: level.title,
        score: Number(level.maxPoints) || 0,
        description: String(criterion.cells[index] || '')
      }))
    }))
  };
}
