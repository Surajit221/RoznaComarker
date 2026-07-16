import { rubricScoresToFeedbackItems } from './dynamic-ai-feedback.util';

describe('dynamic-ai-feedback.util', () => {
  describe('rubricScoresToFeedbackItems', () => {
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

      expect(result).toHaveLength(6);
      expect(result[0].category).toBe('Grammar');
      expect(result[1].category).toBe('Vocabulary');
      expect(result[2].category).toBe('Organization & Structure');
      expect(result[3].category).toBe('Content & Task Achievement');
      expect(result[4].category).toBe('Spelling & Punctuation');
      expect(result[5].category).toBe('Presentation & Handwriting');
    });

    it('should use backend maxScore when provided', () => {
      const rubricScores = {
        GRAMMAR: { score: 20, maxScore: 30, comment: 'Test' }
      };

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.maxScore).toBe(30);
    });

    it('should use category defaults when maxScore is invalid', () => {
      const rubricScores = {
        GRAMMAR: { score: 20, maxScore: -5, comment: 'Test' }
      };

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.maxScore).toBe(25); // Default for GRAMMAR
    });

    it('should use category defaults when maxScore is missing', () => {
      const rubricScores = {
        GRAMMAR: { score: 20, comment: 'Test' }
      };

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.maxScore).toBe(25); // Default for GRAMMAR
    });

    it('should clamp scores to maxScore', () => {
      const rubricScores = {
        GRAMMAR: { score: 30, maxScore: 25, comment: 'Test' }
      };

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.score).toBe(25);
    });

    it('should handle null rubricScores', () => {
      const result = rubricScoresToFeedbackItems(null);

      expect(result).toHaveLength(6);
      result.forEach((item) => {
        expect(item.score).toBe(0);
        expect(item.description).toBe('');
      });
    });

    it('should handle undefined rubricScores', () => {
      const result = rubricScoresToFeedbackItems(undefined);

      expect(result).toHaveLength(6);
      result.forEach((item) => {
        expect(item.score).toBe(0);
        expect(item.description).toBe('');
      });
    });

    it('should handle missing categories with defaults', () => {
      const rubricScores = {
        GRAMMAR: { score: 20, maxScore: 25, comment: 'Test' }
      };

      const result = rubricScoresToFeedbackItems(rubricScores);

      expect(result).toHaveLength(6);
      
      const vocabularyItem = result.find((item) => item.category === 'Vocabulary');
      expect(vocabularyItem?.maxScore).toBe(20); // Default for VOCABULARY
      expect(vocabularyItem?.score).toBe(0);
    });

    it('should preserve comments from backend', () => {
      const rubricScores = {
        GRAMMAR: { score: 20, maxScore: 25, comment: 'Excellent grammar' }
      };

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.description).toBe('Excellent grammar');
    });

    it('should handle invalid scores', () => {
      const rubricScores = {
        GRAMMAR: { score: 'invalid' as any, maxScore: 25, comment: 'Test' }
      };

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.score).toBe(0);
    });

    it('should ensure non-negative scores', () => {
      const rubricScores = {
        GRAMMAR: { score: -10, maxScore: 25, comment: 'Test' }
      };

      const result = rubricScoresToFeedbackItems(rubricScores);
      const grammarItem = result.find((item) => item.category === 'Grammar');

      expect(grammarItem?.score).toBe(0);
    });

    it('should handle backward compatibility with 4-category legacy data', () => {
      const legacyRubricScores = {
        CONTENT: { score: 4, maxScore: 5, comment: 'Good' },
        ORGANIZATION: { score: 4, maxScore: 5, comment: 'Good' },
        GRAMMAR: { score: 4, maxScore: 5, comment: 'Good' },
        VOCABULARY: { score: 4, maxScore: 5, comment: 'Good' }
      };

      const result = rubricScoresToFeedbackItems(legacyRubricScores);

      expect(result).toHaveLength(6);
      
      // Existing categories should preserve their values
      const grammarItem = result.find((item) => item.category === 'Grammar');
      expect(grammarItem?.score).toBe(4);
      expect(grammarItem?.maxScore).toBe(5);
      
      // Missing categories should use defaults
      const mechanicsItem = result.find((item) => item.category === 'Spelling & Punctuation');
      expect(mechanicsItem?.maxScore).toBe(10); // Default for MECHANICS
      expect(mechanicsItem?.score).toBe(0);
      
      const presentationItem = result.find((item) => item.category === 'Presentation & Handwriting');
      expect(presentationItem?.maxScore).toBe(5); // Default for PRESENTATION
      expect(presentationItem?.score).toBe(0);
    });
  });
});
