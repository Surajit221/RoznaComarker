// Students for "Upload student work": typed rows, a CSV file or the class list. The checks mirror the server's
// (backend/src/services/teacherUploadInput.service.js) so most mistakes are shown before anything is sent; the server checks again.

export const MAX_CSV_ROWS = 200;
export const MAX_STUDENTS = 100;
const MAX_NAME_LENGTH = 120;
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const BOM = String.fromCharCode(0xfeff);

export interface StudentFieldErrors { name?: string; email?: string; row?: string }
export interface StudentRow { name: string; email: string; errors?: StudentFieldErrors }
export type CsvRow = StudentRow & { line: number };
export interface CsvResult { rows: CsvRow[]; truncated: boolean; headerFound: boolean }

export function normalizeName(raw: unknown): { value?: string; error?: string } {
  if (typeof raw !== 'string') return { error: 'Enter the student\'s name.' };
  const value = raw.normalize('NFC').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();
  if (!value) return { error: 'Enter the student\'s name.' };
  if (value.length > MAX_NAME_LENGTH) return { error: `Use a name of ${MAX_NAME_LENGTH} characters or fewer.` };
  if (/[<>]/.test(value)) return { error: 'Names cannot contain < or >.' };
  return { value };
}

export function normalizeEmail(raw: unknown): { value?: string; error?: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'Enter the student\'s email address.' };
  const value = raw.trim().toLowerCase();
  if (/[\r\n]/.test(value) || value.length > 254 || !EMAIL_PATTERN.test(value)) return { error: 'Enter a valid email address.' };
  return { value };
}

/** Normalises each row and flags a repeated email (case-insensitive) on every occurrence after the first. */
export function validateStudentRows<T extends { name: unknown; email: unknown }>(rows: T[]): (T & StudentRow)[] {
  const seen = new Map<string, number>();
  return rows.map((row, index) => {
    const name = normalizeName(row.name), email = normalizeEmail(row.email);
    const errors: StudentFieldErrors = {};
    if (name.error) errors.name = name.error;
    if (email.error) errors.email = email.error;
    else if (seen.has(email.value!)) errors.email = `This email is already in the list (row ${seen.get(email.value!)! + 1}).`;
    else seen.set(email.value!, index);
    const rest = { ...row } as T & { errors?: unknown };
    delete rest.errors;                                 // a fixed row loses its old errors
    return { ...rest, name: name.value ?? String(row.name ?? ''), email: email.value ?? String(row.email ?? '').trim(),
      ...(Object.keys(errors).length ? { errors } : {}) } as T & StudentRow;
  });
}

/** RFC 4180 records: quoted fields may hold commas, line breaks and "" (an escaped quote). Returns each record with its first line. */
function records(text: string): { fields: string[]; line: number; unclosedQuote: boolean }[] {
  const out: { fields: string[]; line: number; unclosedQuote: boolean }[] = [];
  let fields: string[] = [], field = '', quoted = false, line = 1, start = 1, i = 0;
  const endRecord = (unclosedQuote = false) => { fields.push(field); out.push({ fields, line: start, unclosedQuote }); fields = []; field = ''; };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i += 1; continue; }
      if (ch === '\n') line += 1;
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field.trim() === '') { quoted = true; field = ''; i += 1; continue; }
    if (ch === ',') { fields.push(field); field = ''; i += 1; continue; }
    if (ch === '\r' || ch === '\n') {
      endRecord();
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      line += 1; start = line; continue;
    }
    field += ch; i += 1;
  }
  if (quoted || field !== '' || fields.length) endRecord(quoted);
  return out;
}

const NAME_HEADERS = ['name', 'student', 'student name', 'full name'];
/**
 * Parses a students CSV (columns name,email in either order with a header, or name,email without one). Strips a UTF-8 BOM, skips
 * empty lines, keeps at most MAX_CSV_ROWS rows and reports each row's problems with its line number.
 */
export function parseStudentCsv(input: string): CsvResult {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const all = records(text).filter(record => record.fields.some(value => value.trim() !== ''));
  let nameAt = 0, emailAt = 1, headerFound = false;
  if (all.length) {
    const head = all[0].fields.map(value => value.trim().toLowerCase());
    const e = head.findIndex(value => value === 'email' || value === 'e-mail' || value === 'email address');
    const n = head.findIndex(value => NAME_HEADERS.includes(value));
    if (e >= 0 && n >= 0) { headerFound = true; nameAt = n; emailAt = e; all.shift(); }
  }
  const truncated = all.length > MAX_CSV_ROWS;
  const raw = all.slice(0, MAX_CSV_ROWS).map(record => ({ line: record.line, name: record.fields[nameAt] ?? '', email: record.fields[emailAt] ?? '',
    unclosedQuote: record.unclosedQuote }));
  const rows = validateStudentRows(raw).map(({ unclosedQuote, ...row }) => unclosedQuote
    ? { ...row, errors: { ...(row.errors || {}), row: 'A quote in this row is not closed.' } } : row);
  return { rows, truncated, headerFound };
}

export const SAMPLE_CSV = 'name,email\r\nSam Lee,sam.lee@example.com\r\n"Rahman, Aisha",aisha.rahman@example.com\r\n';
