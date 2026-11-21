import { buildSpeakingTranscript } from './speaking-transcript';
import type { SpeakingCorrection } from '../api/speaking-api.service';

const TEXT = 'My town have a river.\n\nPeople is friendly there.';
const correction = (over: Partial<SpeakingCorrection>): SpeakingCorrection => ({ id: 'c1', category: 'GRAMMAR', symbol: 'AGR', quotedText: 'town have',
  startChar: 3, endChar: 12, message: 'Use has with town.', suggestedText: 'town has', ...over });

describe('buildSpeakingTranscript (assessed text to transcript words and highlights)', () => {
  it('splits the assessed text into words with their separators (spaces and paragraph breaks)', () => {
    const { words } = buildSpeakingTranscript(TEXT, [], []);
    expect(words.map(w => w.text)).toEqual(['My', 'town', 'have', 'a', 'river.', 'People', 'is', 'friendly', 'there.']);
    expect(words.every(w => w.bbox === null)).toBeTrue();
    expect(words[5].separatorBefore).toBe('\n\n');
    expect(words[1].separatorBefore).toBe(' ');
    expect(new Set(words.map(w => w.id)).size).toBe(words.length);
  });

  it('a correction highlights exactly the words its character offsets cover; one that covers no word is left out', () => {
    const { words, annotations } = buildSpeakingTranscript(TEXT, [correction({}), correction({ id: 'c2', category: 'VOCABULARY', symbol: 'WC', quotedText: 'People is',
      startChar: 23, endChar: 32 }), correction({ id: 'c3', startChar: 900, endChar: 905 })], []);
    const textOf = (ids: string[]) => ids.map(id => words.find(w => w.id === id)!.text);
    expect(annotations.length).toBe(2);
    expect(textOf(annotations[0].wordIds!)).toEqual(['town', 'have']);
    expect(annotations[0]).toEqual(jasmine.objectContaining({ _id: 'c1', category: 'Grammar', symbol: 'AGR', message: 'Use has with town.', suggestedText: 'town has',
      source: 'AI', editable: false }));
    expect(textOf(annotations[1].wordIds!)).toEqual(['People', 'is']);
    expect(annotations[1].category).toBe('Vocabulary');
  });

  it('offsets are start-inclusive and end-exclusive: a span that covers only the space between two words highlights nothing', () => {
    expect(buildSpeakingTranscript(TEXT, [correction({ startChar: 7, endChar: 8, quotedText: ' ' })], []).annotations).toEqual([]);
    const { words, annotations } = buildSpeakingTranscript(TEXT, [correction({ startChar: 8, endChar: 12, quotedText: 'have' })], []);
    expect(annotations[0].wordIds!.map(id => words.find(w => w.id === id)!.text)).toEqual(['have']);
  });

  it('fillers are hidden by default; shown, each stands in brackets at its place and the highlights still match', () => {
    const fillers = [{ offset: 0, text: 'Um,' }, { offset: 13, text: 'uh' }, { offset: TEXT.length, text: 'er' }];
    expect(buildSpeakingTranscript(TEXT, [], fillers).words.some(w => w.text.startsWith('('))).toBeFalse();
    const { words, annotations } = buildSpeakingTranscript(TEXT, [correction({})], fillers, { showFillers: true });
    expect(words.map(w => w.text)).toEqual(['(um)', 'My', 'town', 'have', '(uh)', 'a', 'river.', 'People', 'is', 'friendly', 'there.', '(er)']);
    expect(annotations[0].wordIds!.map(id => words.find(w => w.id === id)!.text)).toEqual(['town', 'have']);
    expect(words.filter(w => w.text.startsWith('(')).every(w => w.id.startsWith('filler-'))).toBeTrue();
  });

  it('empty or missing text: no words', () => {
    expect(buildSpeakingTranscript('', [correction({})], [{ offset: 0, text: 'um' }], { showFillers: true }).words).toEqual([jasmine.objectContaining({ text: '(um)' })]);
    expect(buildSpeakingTranscript(null, [], []).words).toEqual([]);
  });
});
