import { isUtf8Text } from './utf8';
import { MAX_OUTPUT_BYTES } from './runner/protocol';

export const MAX_OUTPUT_TABLE_ROWS = 200;
export const MAX_OUTPUT_TABLE_COLUMNS = 20;
export const MAX_OUTPUT_TABLE_CELL = 512;
export const MAX_OUTPUT_TABLE_QUERY = 100;
export const OUTPUT_TABLE_PAGE_SIZE = 25;

export type OutputTableFormat = 'auto' | 'json' | 'ndjson' | 'csv' | 'tsv';
export type OutputTableStream = 'stdout' | 'stderr';
export type OutputTable = Readonly<{
  format: Exclude<OutputTableFormat, 'auto'>;
  stream: OutputTableStream;
  columns: string[];
  rows: string[][];
  truncated: boolean;
  warning: string | null;
}>;
export type OutputTableResult = { ok: true; table: OutputTable } |
  { ok: false; error: string };

export type OutputTableView = Readonly<{
  query: string;
  columnIndex: number | null;
  sortColumnIndex: number | null;
  descending: boolean;
  page: number;
}>;
export type OutputTablePage = Readonly<{
  rows: string[][];
  totalRows: number;
  page: number;
  pages: number;
  start: number;
  end: number;
}>;

const encoder = new TextEncoder();
const fail = (error: string): OutputTableResult => ({ ok: false, error });
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function sanitizeCell(input: unknown): string {
  let raw: string;
  if (typeof input === 'string') raw = input;
  else if (input === null || input === undefined) raw = '';
  else if (typeof input === 'number' || typeof input === 'boolean') raw = String(input);
  else {
    try { raw = JSON.stringify(input) ?? ''; }
    catch { raw = '[unrenderable value]'; }
  }
  if (raw.length <= MAX_OUTPUT_TABLE_CELL) return raw;
  let end = MAX_OUTPUT_TABLE_CELL;
  const code = raw.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end--;
  return raw.slice(0, end) + '…';
}

function columnNames(raw: string[]): string[] | null {
  if (raw.length === 0 || raw.length > MAX_OUTPUT_TABLE_COLUMNS) return null;
  const seen = new Set<string>();
  return raw.map((name, index) => {
    const plain = sanitizeCell(name.trim() || 'Column ' + (index + 1));
    let unique = plain;
    let suffix = 2;
    while (seen.has(unique)) unique = plain + ' (' + suffix++ + ')';
    seen.add(unique);
    return unique;
  });
}

function makeTable(
  stream: OutputTableStream,
  format: Exclude<OutputTableFormat, 'auto'>,
  names: string[], values: unknown[][], truncated: boolean, warning: string | null,
): OutputTableResult {
  const columns = columnNames(names);
  if (!columns) return fail('The output table needs between 1 and 20 columns.');
  const rows: string[][] = [];
  for (const row of values.slice(0, MAX_OUTPUT_TABLE_ROWS)) {
    const result = columns.map((_, index) => sanitizeCell(row[index]));
    rows.push(result);
  }
  return {
    ok: true, table: {
      stream, format, columns, rows,
      truncated: truncated || values.length > MAX_OUTPUT_TABLE_ROWS,
      warning,
    },
  };
}

function recordTable(
  records: unknown[], stream: OutputTableStream,
  format: 'json' | 'ndjson', truncated = false,
): OutputTableResult {
  const limited = records.slice(0, MAX_OUTPUT_TABLE_ROWS);
  if (limited.length === 0) return fail('No JSON records were available to inspect.');
  const allObjects = limited.every(object);
  const allArrays = limited.every(Array.isArray);
  let names: string[];
  let rows: unknown[][];
  if (allObjects) {
    const seen = new Set<string>();
    for (const value of limited as Record<string, unknown>[]) {
      for (const key of Object.keys(value)) {
        seen.add(key);
        if (seen.size > MAX_OUTPUT_TABLE_COLUMNS) {
          return fail('JSON records contain more than 20 distinct fields.');
        }
      }
    }
    names = [...seen];
    rows = (limited as Record<string, unknown>[]).map(record =>
      names.map(name => Object.hasOwn(record, name) ? record[name] : null));
  } else if (allArrays) {
    const arrays = limited as unknown[][];
    const largest = Math.max(...arrays.map(value => value.length));
    if (largest > MAX_OUTPUT_TABLE_COLUMNS) return fail('JSON arrays exceed 20 columns.');
    names = Array.from({ length: largest }, (_, index) => 'Column ' + (index + 1));
    rows = arrays;
  } else if (limited.every(value => !object(value) && !Array.isArray(value))) {
    names = ['Value'];
    rows = limited.map(value => [value]);
  } else {
    return fail('JSON table rows must consistently contain objects, arrays or scalar values.');
  }
  const result = makeTable(
    stream, format, names, rows,
    truncated || records.length > MAX_OUTPUT_TABLE_ROWS,
    'JSON numbers use JavaScript numeric precision. Quote very large integers for exact display.',
  );
  return result;
}

function parseJson(source: string, stream: OutputTableStream): OutputTableResult {
  let decoded: unknown;
  try { decoded = JSON.parse(source); }
  catch { return fail('The selected output is not valid JSON.'); }
  const records = Array.isArray(decoded) ? decoded : [decoded];
  return recordTable(records, stream, 'json');
}

function parseNdjson(source: string, stream: OutputTableStream): OutputTableResult {
  const lines = source.split(/\r\n|\r|\n/).filter(Boolean);
  if (!lines.length) return fail('No JSON lines were found in the selected output.');
  const parsed: unknown[] = [];
  let truncated = false;
  for (const [index, line] of lines.entries()) {
    if (parsed.length >= MAX_OUTPUT_TABLE_ROWS) {
      truncated = true;
      break;
    }
    try { parsed.push(JSON.parse(line)); }
    catch { return fail('JSON line ' + (index + 1) + ' contains invalid JSON.'); }
  }
  return recordTable(parsed, stream, 'ndjson', truncated);
}

type ParsedCsv = Readonly<{ rows: string[][]; truncated: boolean }>;

function parseDelimited(text: string, separator: ',' | '\t'): ParsedCsv | null {
  const rows: string[][] = [];
  let columns: string[] = [];
  let value = '';
  let quoted = false;
  let endedQuote = false;
  let started = false;
  let truncated = false;
  const field = () => {
    columns.push(value);
    value = '';
    started = false;
    endedQuote = false;
  };
  const row = () => {
    field();
    rows.push(columns);
    columns = [];
    if (rows.length > MAX_OUTPUT_TABLE_ROWS + 1) truncated = true;
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          if (value.length < MAX_OUTPUT_TABLE_CELL + 1) value += '"';
          index++;
        } else {
          quoted = false;
          endedQuote = true;
        }
      } else if (value.length < MAX_OUTPUT_TABLE_CELL + 1) value += char;
      continue;
    }
    if (char === separator) {
      field();
      continue;
    }
    if (char === '\r' || char === '\n') {
      row();
      if (char === '\r' && text[index + 1] === '\n') index++;
      if (truncated) break;
      continue;
    }
    if (endedQuote) return null; // Strict RFC-style field termination.
    if (char === '"') {
      if (started) return null;
      quoted = true;
      started = true;
      continue;
    }
    started = true;
    if (value.length < MAX_OUTPUT_TABLE_CELL + 1) value += char;
  }
  if (quoted) return null;
  if (columns.length || value || endedQuote || started) row();
  if (!rows.length) return null;
  return { rows, truncated };
}

function parseSeparated(
  source: string, stream: OutputTableStream,
  format: 'csv' | 'tsv',
): OutputTableResult {
  const parsed = parseDelimited(source, format === 'csv' ? ',' : '\t');
  if (!parsed) return fail('Invalid or unterminated ' + format.toUpperCase() + ' field.');
  const [header, ...values] = parsed.rows;
  if (!header) return fail('The delimited output contains no column headers.');
  const count = header.length;
  if (count === 0 || count > MAX_OUTPUT_TABLE_COLUMNS) {
    return fail('The delimited output needs between 1 and 20 columns.');
  }
  for (const row of values) {
    if (row.length !== count) return fail('All delimited rows must have the same number of fields.');
  }
  return makeTable(stream, format, header, values, parsed.truncated, null);
}

/**
 * Inspect already-captured compiler text without executing code or relying
 * on external storage. Only structured formats are parsed. This does not
 * interpret source text, formulas or HTML.
 */
export function inspectOutputTable(
  stdout: unknown, stderr: unknown,
  stream: OutputTableStream, format: OutputTableFormat,
): OutputTableResult {
  if (typeof stdout !== 'string' || typeof stderr !== 'string' ||
      !isUtf8Text(stdout, MAX_OUTPUT_BYTES) || !isUtf8Text(stderr, MAX_OUTPUT_BYTES) ||
      encoder.encode(stdout).byteLength + encoder.encode(stderr).byteLength > MAX_OUTPUT_BYTES) {
    return fail('The captured compiler output is malformed or exceeds the output budget.');
  }
  if (stream !== 'stdout' && stream !== 'stderr') return fail('Select stdout or stderr.');
  if (!['auto', 'json', 'ndjson', 'csv', 'tsv'].includes(format)) {
    return fail('Choose a supported structured output format.');
  }
  const value = stream === 'stdout' ? stdout : stderr;
  if (!value.trim()) return fail('The selected output stream is empty.');
  if (format === 'json') return parseJson(value, stream);
  if (format === 'ndjson') return parseNdjson(value, stream);
  if (format === 'csv' || format === 'tsv') return parseSeparated(value, stream, format);

  const prefix = value.trimStart();
  if (prefix.startsWith('[') || prefix.startsWith('{')) {
    const parsed = parseJson(value, stream);
    if (parsed.ok) return parsed;
  }
  const ndjson = parseNdjson(value, stream);
  if (ndjson.ok && value.split(/\r\n|\r|\n/).filter(Boolean).length >= 2) return ndjson;
  if (value.includes('\t')) {
    const tsv = parseSeparated(value, stream, 'tsv');
    if (tsv.ok) return tsv;
  }
  if (value.includes(',')) {
    const csv = parseSeparated(value, stream, 'csv');
    if (csv.ok) return csv;
  }
  return fail('No recognized JSON, JSON-lines, CSV or TSV table was found in this stream.');
}

/** Filter/sort only already parsed bounded cells, without locale numeric coercion. */
export function viewOutputTable(
  table: OutputTable, options: OutputTableView,
): OutputTablePage | null {
  if (!table || !options || typeof options.query !== 'string' ||
      options.query.length > MAX_OUTPUT_TABLE_QUERY ||
      !Number.isSafeInteger(options.page) || options.page < 1 ||
      typeof options.descending !== 'boolean' ||
      (options.columnIndex !== null &&
        (!Number.isSafeInteger(options.columnIndex) || options.columnIndex < 0 ||
          options.columnIndex >= table.columns.length)) ||
      (options.sortColumnIndex !== null &&
        (!Number.isSafeInteger(options.sortColumnIndex) || options.sortColumnIndex < 0 ||
          options.sortColumnIndex >= table.columns.length))) return null;
  const query = options.query.toLocaleLowerCase();
  const filterColumn = options.columnIndex ?? -1;
  const sortColumn = options.sortColumnIndex ?? -1;
  const matching = table.rows.filter(row => filterColumn < 0
    ? row.some(value => value.toLocaleLowerCase().includes(query))
    : row[filterColumn].toLocaleLowerCase().includes(query));
  const ordered = [...matching];
  if (sortColumn >= 0) ordered.sort((a, b) => {
    const result = a[sortColumn].localeCompare(b[sortColumn]);
    return options.descending ? -result : result;
  });
  const pages = Math.max(1, Math.ceil(ordered.length / OUTPUT_TABLE_PAGE_SIZE));
  const page = Math.min(options.page, pages);
  const start = (page - 1) * OUTPUT_TABLE_PAGE_SIZE;
  return {
    rows: ordered.slice(start, start + OUTPUT_TABLE_PAGE_SIZE),
    totalRows: ordered.length, page, pages,
    start: ordered.length ? start + 1 : 0,
    end: Math.min(ordered.length, start + OUTPUT_TABLE_PAGE_SIZE),
  };
}
