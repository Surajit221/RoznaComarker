import { customRubricScoresToFeedbackItems, rubricScoresToFeedbackItems } from './dynamic-ai-feedback.util';

describe('dynamic-ai-feedback.util', () => {
  describe('rubricScoresToFeedbackItems', () => {
    const complete = (overrides: Record<string, any> = {}) => ({
      CONTENT: { score: 18, maxScore: 20, comment: 'Good content' },
      ORGANIZATION: { score: 16, maxScore: 20, comment: 'Well structured' },
      GRAMMAR: { score: 22, maxScore: 25, comment: 'Minor errors' },
      VOCABULARY: { score: 15, maxScore: 20, comment: 'Varied vocabulary' },
      MECHANICS: { score: 8, maxScore: 10, comment: 'Good spelling' },
      PRESENTATION: { score: 4, maxScore: 5, comment: 'Neat handwriting' },
      ...overrides
    });

    it('should return six feedback cards for all categories', () => {
      const rubricScores = {
        CONTENT: { score: 18, maxScore: 20, comment: 'Good content' },
        ORGANIZATION: { score: 16, maxScore: 20, comment: 'Well structured' },
        GRAMMAR: { score: 22, maxScore: 25, comment: 'Minor errors' },
        VOCABULARY: { score: 15, maxScore: 20, comment: 'Varied vocabulary' },
        MECHANICS: { score: 8, maxScore: 10, comment: 'Good spelling' },
        PRESENTATION: { score: 4, maxScore: 5, comment: 'Neat handwriting' }
      };

      const result = rubricScoresToFeedbackItems(rubricScores);

      expect(result.length).toBe(6);
      expect(result[0].category).toBe('Grammar');
      expect(result[1].category).toBe('Vocabulary');
      expect(result[2].category).toBe('Organization & Structure');
      expect(result[3].category).toBe('Content & Task Achievement');
      expect(result[4].category).toBe('Spelling & Punctuation');
      expect(result[5].category).toBe('Presentation & Handwriting');
    });

    it('should use backend maxScore when provided', () => {
      const rubricScores = complete({ GRAMMAR: { score: 20, maxScore: 30, comment: 'Test' } });

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.maxScore).toBe(30);
    });

    it('should use category defaults when maxScore is invalid', () => {
      const rubricScores = complete({ GRAMMAR: { score: 20, maxScore: -5, comment: 'Test' } });

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.maxScore).toBe(25); // Default for GRAMMAR
    });

    it('should use category defaults when maxScore is missing', () => {
      const rubricScores = complete({ GRAMMAR: { score: 20, comment: 'Test' } });

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.maxScore).toBe(25); // Default for GRAMMAR
    });

    it('should clamp scores to maxScore', () => {
      const rubricScores = complete({ GRAMMAR: { score: 30, maxScore: 25, comment: 'Test' } });

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.score).toBe(25);
    });

    it('should handle null rubricScores', () => {
      const result = rubricScoresToFeedbackItems(null);

      expect(result).toEqual([]);
    });

    it('should handle undefined rubricScores', () => {
      const result = rubricScoresToFeedbackItems(undefined);

      expect(result).toEqual([]);
    });

    it('should hide partially persisted categories rather than synthesize zeros', () => {
      const rubricScores = {
        GRAMMAR: { score: 20, maxScore: 25, comment: 'Test' }
      };

      const result = rubricScoresToFeedbackItems(rubricScores);

      expect(result).toEqual([]);
    });

    it('should preserve comments from backend', () => {
      const rubricScores = complete({ GRAMMAR: { score: 20, maxScore: 25, comment: 'Excellent grammar' } });

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.description).toBe('Excellent grammar');
    });

    it('should handle invalid scores', () => {
      const rubricScores = complete({ GRAMMAR: { score: 'invalid' as any, maxScore: 25, comment: 'Test' } });

      const result = rubricScoresToFeedbackItems(rubricScores);
      expect(result).toEqual([]);
    });

    it('should ensure non-negative scores', () => {
      const rubricScores = complete({ GRAMMAR: { score: -10, maxScore: 25, comment: 'Test' } });

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.score).toBe(0);
    });

    it('should not present missing legacy categories as scored zeros', () => {
      const legacyRubricScores = {
        CONTENT: { score: 4, maxScore: 5, comment: 'Good' },
        ORGANIZATION: { score: 4, maxScore: 5, comment: 'Good' },
        GRAMMAR: { score: 4, maxScore: 5, comment: 'Good' },
        VOCABULARY: { score: 4, maxScore: 5, comment: 'Good' }
      };

      const result = rubricScoresToFeedbackItems(legacyRubricScores);

      expect(result).toEqual([]);
    });
  });

  describe('customRubricScoresToFeedbackItems', () => {
    it('maps canonical custom-rubric fields without recalculating weighted points', () => {
      const result = customRubricScoresToFeedbackItems({
        criteria: [{
          criterionId: 'criterion-1',
          title: 'Evidence',
          normalizedWeight: 30,
          selectedLevel: 'Satisfactory',
          configuredLevelPercentage: 60,
          weightedPoints: 18,
          comment: 'Supported judgment.'
        }]
      });

      expect(result).toEqual([{
        criterionId: 'criterion-1',
        title: 'Evidence',
        category: 'Evidence',
        normalizedWeight: 30,
        selectedLevel: 'Satisfactory',
        configuredLevelPercentage: 60,
        weightedPoints: 18,
        comment: 'Supported judgment.',
        score: 18,
        maxScore: 30,
        description: 'Supported judgment.'
      }]);
    });

    it('supports compatibility aliases from previously persisted custom results', () => {
      expect(customRubricScoresToFeedbackItems({
        criteria: [{
          criterionId: 'criterion-1', title: 'Evidence', weight: 30,
          levelTitle: 'Satisfactory', percentage: 60, weightedPoints: 18, comment: ''
        }]
      })[0]).toEqual(jasmine.objectContaining({
        normalizedWeight: 30, selectedLevel: 'Satisfactory', configuredLevelPercentage: 60
      }));
    });
  });
});
