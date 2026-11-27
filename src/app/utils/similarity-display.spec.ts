import { flowText } from './similarity-display';

describe('flowText (display only: the essay as flowing paragraphs, same length, same offsets)', () => {
  it('turns a single line break into a space and keeps the length', () => {
    const text = 'one two\nthree four\nfive';
    const out = flowText(text);
    expect(out).toBe('one two three four five');
    expect(out.length).toBe(text.length);
  });
  it('keeps paragraph breaks (a blank line, also with spaces or a carriage return on it) and the page separator', () => {
    expect(flowText('a\nb\n\nc\nd')).toBe('a b\n\nc d');
    expect(flowText('a\n \nb')).toBe('a\n \nb');
    expect(flowText('a\r\n\r\nb\r\nc')).toBe('a\r\n\r\nb  c');
    expect(flowText('end\n\n\f\n\nnext\nline')).toBe('end\n\n\f\n\nnext line');
  });
  it('every character that is not a single line break is unchanged, so highlight offsets stay exact', () => {
    const text = 'Line one of it\nline two\n\nNew para\r\nwith CRLF\n';
    const out = flowText(text);
    expect(out.length).toBe(text.length);
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '\n' && text[i] !== '\r') expect(out[i]).toBe(text[i]);
    }
    expect(text.slice(15, 23)).toBe(out.slice(15, 23));
  });
  it('a break at the very start or end is a single break too; empty and non-text input are safe', () => {
    expect(flowText('\nx\n')).toBe(' x ');
    expect(flowText('')).toBe('');
    expect(flowText(null as unknown as string)).toBe('');
  });
});
