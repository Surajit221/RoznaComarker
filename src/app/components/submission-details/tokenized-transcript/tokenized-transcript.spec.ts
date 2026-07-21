import { SimpleChange } from '@angular/core';

import { TokenizedTranscript } from './tokenized-transcript';

describe('TokenizedTranscript canonical separators', () => {
  it('renders only backend separators and never infers line breaks from geometry', () => {
    const component = new TokenizedTranscript();
    component.ocrWords = [
      { id: '1', text: 'Parking', bbox: { x: 10, y: 10, w: 10, h: 2 }, separatorBefore: '' },
      { id: '2', text: 'gives', bbox: { x: 10, y: 30, w: 8, h: 2 }, separatorBefore: ' ' },
      { id: '3', text: 'more', bbox: null, separatorBefore: ' ' },
      { id: '4', text: 'in', bbox: null, separatorBefore: ' ' },
      { id: '5', text: 'campus.', bbox: null, separatorBefore: ' ' }
    ];
    component.ngOnChanges({ ocrWords: new SimpleChange(null, component.ocrWords, true) });
    const rendered = component.tokens.map((token) => token.kind === 'word' ? token.word.text : token.value).join('');
    expect(rendered).toBe('Parking gives more in campus.');
    expect(component.tokens.some((token) => token.kind === 'newline')).toBeFalse();
  });

  it('renders a canonical paragraph only when the API supplies two newlines', () => {
    const component = new TokenizedTranscript();
    component.ocrWords = [
      { id: '1', text: 'First.', bbox: null, separatorBefore: '' },
      { id: '2', text: 'Second.', bbox: null, separatorBefore: '\n\n' }
    ];
    component.ngOnChanges({ ocrWords: new SimpleChange(null, component.ocrWords, true) });
    const separator = component.tokens.find((token) => token.kind === 'newline');
    expect(separator && separator.kind === 'newline' ? separator.value : '').toBe('\n\n');
  });
});
