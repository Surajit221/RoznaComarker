import { MAX_CSV_ROWS, SAMPLE_CSV, normalizeEmail, normalizeName, parseStudentCsv, validateStudentRows } from './student-input';

describe('student input', () => {
  describe('normalizeName / normalizeEmail', () => {
    it('cleans names and refuses empty, angle brackets and very long names', () => {
      expect(normalizeName('  Sam   Lee ')).toEqual({ value: 'Sam Lee' });
      expect(normalizeName('Sam' + String.fromCharCode(0x200b) + 'Lee' + String.fromCharCode(0x2028))).toEqual({ value: 'Sam Lee' });
      expect(normalizeName('Student 2029')).toEqual({ value: 'Student 2029' });
      for (const bad of ['', '  ', '<b>x</b>', 'a'.repeat(121), null]) expect(normalizeName(bad).error).toBeTruthy();
    });
    it('lower-cases emails and refuses invalid or injected ones', () => {
      expect(normalizeEmail(' Sam.Lee@Example.COM ')).toEqual({ value: 'sam.lee@example.com' });
      for (const bad of ['', 'nope', 'a@b', 'a@b.com\r\nBcc: x@y.com', '"Sam" <s@example.com>', 'a@b.com, c@d.com'])
        expect(normalizeEmail(bad).error).toBeTruthy();
    });
  });

  describe('validateStudentRows', () => {
    it('flags repeated emails case-insensitively on every later occurrence', () => {
      const rows = validateStudentRows([{ name: 'A', email: 'a@example.com' }, { name: 'B', email: 'A@Example.com' }, { name: 'C', email: 'a@example.com' }]);
      expect(rows[0].errors).toBeUndefined();
      expect(rows[1].errors?.email).toContain('row 1');
      expect(rows[2].errors?.email).toContain('row 1');
    });
    it('clears earlier errors once a row is fixed', () => {
      const [row] = validateStudentRows([{ name: 'Sam', email: 'sam@example.com', errors: { email: 'old' } }]);
      expect(row.errors).toBeUndefined();
    });
  });

  describe('parseStudentCsv', () => {
    it('reads a UTF-8 BOM, a header, quoted commas, escaped quotes and CRLF', () => {
      const result = parseStudentCsv(String.fromCharCode(0xfeff) + 'name,email\r\n"Rahman, Aisha",aisha@example.com\r\n"Sam ""Sammy"" Lee", SAM@example.com \r\n');
      expect(result.headerFound).toBeTrue();
      expect(result.rows.map(r => [r.line, r.name, r.email, r.errors])).toEqual([
        [2, 'Rahman, Aisha', 'aisha@example.com', undefined], [3, 'Sam "Sammy" Lee', 'sam@example.com', undefined]]);
    });
    it('accepts no header, LF or CR line endings, extra columns and skips empty lines', () => {
      const result = parseStudentCsv('Sam Lee,sam@example.com,7B\n\n   \nMia,mia@example.com\rLeo,leo@example.com');
      expect(result.headerFound).toBeFalse();
      expect(result.rows.map(r => r.email)).toEqual(['sam@example.com', 'mia@example.com', 'leo@example.com']);
      expect(result.rows.map(r => r.line)).toEqual([1, 4, 5]);
    });
    it('follows the header order (email first)', () => {
      expect(parseStudentCsv('Email,Student Name\nsam@example.com,Sam Lee').rows[0]).toEqual(jasmine.objectContaining({ name: 'Sam Lee', email: 'sam@example.com' }));
    });
    it('keeps a line break inside a quoted name on one row, reported on its first line', () => {
      const result = parseStudentCsv('name,email\n"Sam\nLee",sam@example.com\nMia,mia@example.com');
      expect(result.rows.map(r => [r.line, r.name])).toEqual([[2, 'Sam Lee'], [4, 'Mia']]);
    });
    it('reports bad emails, missing fields, duplicates and an unclosed quote per row', () => {
      const result = parseStudentCsv('name,email\nSam,not-an-email\n,mia@example.com\nLeo\nAna,ana@example.com\nAna Again,ANA@example.com\n"Broken,x@example.com');
      const errors = result.rows.map(r => r.errors);
      expect(errors[0]?.email).toBe('Enter a valid email address.');
      expect(errors[1]?.name).toBe('Enter the student\'s name.');
      expect(errors[2]?.email).toBe('Enter the student\'s email address.');
      expect(errors[3]).toBeUndefined();
      expect(errors[4]?.email).toContain('already in the list');
      expect(errors[5]?.row).toBe('A quote in this row is not closed.');
    });
    it(`keeps at most ${MAX_CSV_ROWS} rows and says so`, () => {
      const csv = Array.from({ length: MAX_CSV_ROWS + 5 }, (_, i) => `S${i},s${i}@example.com`).join('\n');
      const result = parseStudentCsv(csv);
      expect(result.rows.length).toBe(MAX_CSV_ROWS); expect(result.truncated).toBeTrue();
      expect(parseStudentCsv('').rows).toEqual([]);
    });
    it('parses its own sample file cleanly', () => {
      const result = parseStudentCsv(SAMPLE_CSV);
      expect(result.rows.every(r => !r.errors)).toBeTrue();
      expect(result.rows.map(r => r.name)).toEqual(['Sam Lee', 'Rahman, Aisha']);
    });
  });
});
