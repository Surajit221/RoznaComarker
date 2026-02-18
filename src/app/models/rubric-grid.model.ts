export interface Rubric {
  title: string;
  instructions: string;
  maxScore: number;
  score?: number;
}

export interface RubricGridRow {
  criteria: string;
  rubrics: Rubric[];
}

export interface RubricGrid {
  title: string;
  rows: RubricGridRow[];
}
