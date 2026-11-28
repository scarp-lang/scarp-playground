import { describe, expect, it } from 'vitest';
import {
  MAX_OUTPUT_TABLE_ROWS, MAX_OUTPUT_TABLE_COLUMNS, MAX_OUTPUT_TABLE_CELL,
  MAX_OUTPUT_TABLE_QUERY, OUTPUT_TABLE_PAGE_SIZE,
  inspectOutputTable, viewOutputTable, type OutputTable, type OutputTableView,
} from '../src/output-table';
import { MAX_OUTPUT_BYTES } from '../src/runner/protocol';

function parse(value: string, format: 'auto' | 'json' | 'ndjson' | 'csv' | 'tsv' = 'auto') {
  const result = inspectOutputTable(value, '', 'stdout', format);
  if (!result.ok) throw Error(result.error);
  return result.table;
}
function view(table: OutputTable, options: Partial<OutputTableView> = {}) {
  return viewOutputTable(table, {
    query: '', columnIndex: null, sortColumnIndex: null,
    descending: false, page: 1, ...options,
  });
}

describe('safe structured console output parsing', () => {
  it('parses an array of JSON objects with stable headers and string cells', () => {
    const table = parse('[{"name":"Ada","score":42},{"name":"Grace","score":99}]');
    expect(table.format).toBe('json');
    expect(table.columns).toEqual(['name', 'score']);
    expect(table.rows).toEqual([['Ada', '42'], ['Grace', '99']]);
    expect(table.truncated).toBe(false);
  });

  it('accepts a single JSON record as a one-row table', () => {
    const table = parse('{"ok":true,"count":3}', 'json');
    expect(table.columns).toEqual(['ok', 'count']);
    expect(table.rows).toEqual([['true', '3']]);
  });

  it('combines fields from several records without losing missing values', () => {
    const table = parse('[{"a":1},{"b":2},{"a":3,"b":4}]', 'json');
    expect(table.columns).toEqual(['a', 'b']);
    expect(table.rows).toEqual([['1', ''], ['', '2'], ['3', '4']]);
  });

  it('can parse arrays of arrays as numbered table columns', () => {
    const table = parse('[[1,2],[3,4],[5]]', 'json');
    expect(table.columns).toEqual(['Column 1', 'Column 2']);
    expect(table.rows).toEqual([['1', '2'], ['3', '4'], ['5', '']]);
  });

  it('can represent a homogeneous array of JSON scalar values', () => {
    const table = parse('[true,42,null,"hello"]', 'json');
    expect(table.columns).toEqual(['Value']);
    expect(table.rows).toEqual([['true'], ['42'], [''], ['hello']]);
  });

  it('rejects incompatible mixtures of JSON scalars, arrays and objects', () => {
    const result = inspectOutputTable('[{},1]', '', 'stdout', 'json');
    expect(result.ok).toBe(false);
  });

  it('shows nested JSON values as inert bounded text', () => {
    const table = parse('[{"name":"A","values":[1,2],"obj":{"x":true}}]');
    expect(table.rows).toEqual([['A', '[1,2]', '{"x":true}']]);
  });

  it('does not execute or interpret HTML strings while preparing cells', () => {
    const table = parse('[{"html":"<img onerror=alert(1)>"}]');
    expect(table.rows[0][0]).toBe('<img onerror=alert(1)>');
    expect(table.rows[0][0]).not.toContain('HTMLImageElement');
  });

  it('preserves special JSON property names without prototype mutation', () => {
    const source = '[{"__proto__":"x","constructor":"y","prototype":"z"}]';
    const table = parse(source);
    expect(table.columns).toContain('__proto__');
    expect(table.rows[0]).toContain('x');
    expect(({} as Record<string, unknown>).prototype).toBeUndefined();
  });

  it('rejects JSON rows containing more than twenty fields', () => {
    const source = '[' + JSON.stringify(Object.fromEntries(
      Array.from({ length: MAX_OUTPUT_TABLE_COLUMNS + 1 },
        (_, i) => ['key_' + i, i]),
    )) + ']';
    expect(inspectOutputTable(source, '', 'stdout', 'json').ok).toBe(false);
  });

  it('truncates larger JSON arrays and retains the first 200 rows', () => {
    const value = JSON.stringify(Array.from({
      length: MAX_OUTPUT_TABLE_ROWS + 12,
    }, (_, i) => ({ row: i })));
    const table = parse(value, 'json');
    expect(table.rows).toHaveLength(MAX_OUTPUT_TABLE_ROWS);
    expect(table.rows.at(-1)).toEqual(['199']);
    expect(table.truncated).toBe(true);
  });

  it('warns that JSON numeric parsing cannot preserve arbitrary precision', () => {
    const table = parse('[{"value":9007199254740993}]');
    expect(table.warning).toContain('numeric precision');
  });

  it('parses standalone line-delimited JSON objects', () => {
    const value = '{"name":"Ada","n":1}\n{"name":"Grace","n":2}\n';
    const table = parse(value, 'ndjson');
    expect(table.format).toBe('ndjson');
    expect(table.rows).toEqual([['Ada', '1'], ['Grace', '2']]);
  });

  it('can autodetect JSON-lines output without a header', () => {
    const table = parse('{"x":1}\r\n{"x":2}\r\n');
    expect(table.format).toBe('ndjson');
    expect(table.rows).toEqual([['1'], ['2']]);
  });

  it('rejects an invalid JSON line with its exact one-based position', () => {
    const output = inspectOutputTable('{"a":1}\nnot-json\n', '', 'stdout', 'ndjson');
    expect(output.ok).toBe(false);
    if (!output.ok) expect(output.error).toContain('JSON line 2');
  });

  it('caps large JSON-lines result sets without unbounded table rows', () => {
    const value = Array.from({ length: MAX_OUTPUT_TABLE_ROWS + 50 },
      (_, index) => JSON.stringify({ index })).join('\n');
    const table = parse(value, 'ndjson');
    expect(table.rows).toHaveLength(MAX_OUTPUT_TABLE_ROWS);
    expect(table.truncated).toBe(true);
  });

  it('parses a CSV header and several rows with CRLF endings', () => {
    const table = parse('name,score\r\nAda,42\r\nGrace,99\r\n', 'csv');
    expect(table.columns).toEqual(['name', 'score']);
    expect(table.rows).toEqual([['Ada', '42'], ['Grace', '99']]);
    expect(table.warning).toBeNull();
  });

  it('autodetects plain CSV from captured stdout', () => {
    const table = parse('name,age\nAda,36\n');
    expect(table.format).toBe('csv');
    expect(table.rows).toEqual([['Ada', '36']]);
  });

  it('parses quoted commas, escaped double quotes and literal multiline fields', () => {
    const table = parse('name,note\n"Ada","hello, world"\n' +
      '"Grace","say ""hello"""\n"Lin","line1\nline2"\n', 'csv');
    expect(table.rows).toEqual([
      ['Ada', 'hello, world'], ['Grace', 'say "hello"'], ['Lin', 'line1\nline2'],
    ]);
  });

  it('rejects unterminated quotes instead of returning a misleading partial table', () => {
    expect(inspectOutputTable('a,b\n"unfinished,5', '', 'stdout', 'csv').ok).toBe(false);
  });

  it('rejects invalid quote characters within unquoted CSV fields', () => {
    expect(inspectOutputTable('a,b\nfoo"bar,baz', '', 'stdout', 'csv').ok).toBe(false);
  });

  it('rejects different numbers of CSV columns', () => {
    expect(inspectOutputTable('a,b\n1,2,3\n', '', 'stdout', 'csv').ok).toBe(false);
  });

  it('parses a TSV header with untouched large numeric strings', () => {
    const digits = '9'.repeat(60);
    const table = parse('name\tbigint\nAda\t' + digits + '\n', 'tsv');
    expect(table.rows).toEqual([['Ada', digits]]);
    expect(table.warning).toBeNull();
  });

  it('autodetects tab-separated content ahead of comma-only content', () => {
    const table = parse('name\tmessage\nAda\thello, world\n');
    expect(table.format).toBe('tsv');
    expect(table.rows).toEqual([['Ada', 'hello, world']]);
  });

  it('assigns unique display column names to repeated or blank CSV headers', () => {
    const table = parse(',name,name\n1,2,3\n', 'csv');
    expect(table.columns).toEqual(['Column 1', 'name', 'name (2)']);
  });

  it('preserves formula-like spreadsheet strings without evaluating them', () => {
    const table = parse('item,value\nformula,=1+2\n', 'csv');
    expect(table.rows[0][1]).toBe('=1+2');
  });

  it('caps individual very long cells while scanning the full CSV record', () => {
    const table = parse('name,body\nAda,' + 'x'.repeat(MAX_OUTPUT_TABLE_CELL + 300) + '\n', 'csv');
    expect(table.rows[0][1].length).toBeLessThanOrEqual(MAX_OUTPUT_TABLE_CELL + 1);
    expect(table.rows[0][1].endsWith('…')).toBe(true);
  });

  it('rejects unsupported stream and format values at the runtime boundary', () => {
    expect(inspectOutputTable('a,b\n1,2', '', 'other' as 'stdout', 'csv').ok).toBe(false);
    expect(inspectOutputTable('a,b\n1,2', '', 'stdout', 'xml' as never).ok)
      .toBe(false);
  });

  it('rejects malformed output or data over the compiler protocol budget', () => {
    expect(inspectOutputTable('\uD800', '', 'stdout', 'json').ok).toBe(false);
    expect(inspectOutputTable(null, '', 'stdout', 'json').ok).toBe(false);
    expect(inspectOutputTable('x'.repeat(MAX_OUTPUT_BYTES + 1), '', 'stdout', 'csv').ok)
      .toBe(false);
  });

  it('rejects an empty selected stream but can inspect stderr explicitly', () => {
    expect(inspectOutputTable('', 'a,b\n1,2', 'stdout', 'csv').ok).toBe(false);
    const reply = inspectOutputTable('', 'a,b\n1,2', 'stderr', 'csv');
    expect(reply.ok).toBe(true);
    if (reply.ok) {
      expect(reply.table.stream).toBe('stderr');
      expect(reply.table.rows).toEqual([['1', '2']]);
    }
  });

  it('returns a non-fatal error for completely unstructured plain output', () => {
    const output = inspectOutputTable('hello from Scarp!\n', '', 'stdout', 'auto');
    expect(output.ok).toBe(false);
  });
});

describe('bounded filtering, sorting and pagination', () => {
  const source = 'name,score\n' +
    Array.from({ length: 61 }, (_, i) => 'user-' + i + ',' + (100 - i)).join('\n');
  const table = parse(source, 'csv');

  it('returns the first 25 rows by default with exact page counts', () => {
    const result = view(table)!;
    expect(result.rows).toHaveLength(OUTPUT_TABLE_PAGE_SIZE);
    expect(result.page).toBe(1);
    expect(result.pages).toBe(3);
    expect(result.start).toBe(1);
    expect(result.end).toBe(25);
    expect(result.totalRows).toBe(61);
  });

  it('returns the final page with a bounded row count', () => {
    const result = view(table, { page: 3 })!;
    expect(result.rows).toHaveLength(11);
    expect(result.start).toBe(51);
    expect(result.end).toBe(61);
  });

  it('clamps out-of-range page numbers without causing a crash', () => {
    const result = view(table, { page: 999 })!;
    expect(result.page).toBe(3);
  });

  it('filters across all columns using case-insensitive substring matching', () => {
    const result = view(table, { query: 'USER-59' })!;
    expect(result.totalRows).toBe(1);
    expect(result.rows[0][0]).toBe('user-59');
  });

  it('filters by one explicit column instead of any cell', () => {
    const result = view(table, { query: '100', columnIndex: 0 })!;
    expect(result.totalRows).toBe(0);
    expect(view(table, { query: '100', columnIndex: 1 })?.totalRows).toBe(1);
  });

  it('sorts records lexically by an explicit column', () => {
    const result = view(table, { sortColumnIndex: 0 })!;
    expect(result.rows[0][0]).toBe('user-0');
    expect(result.rows[1][0]).toBe('user-1');
    expect(result.rows[2][0]).toBe('user-10');
  });

  it('reverses the explicit textual order without changing original records', () => {
    const before = JSON.stringify(table.rows);
    const result = view(table, { sortColumnIndex: 0, descending: true })!;
    expect(result.rows[0][0]).toBe('user-9');
    expect(JSON.stringify(table.rows)).toBe(before);
  });

  it('keeps the original row order when no sort column is chosen', () => {
    expect(view(table, { sortColumnIndex: null, descending: true })?.rows[0][0]).toBe('user-0');
  });

  it('rejects invalid query, unknown field or page inputs', () => {
    expect(view(table, { query: 'x'.repeat(MAX_OUTPUT_TABLE_QUERY + 1) })).toBeNull();
    expect(view(table, { columnIndex: 99 })).toBeNull();
    expect(view(table, { sortColumnIndex: 99 })).toBeNull();
    expect(view(table, { page: -1 })).toBeNull();
    expect(view(table, { page: Number.NaN })).toBeNull();
  });

  it('paginates a zero-match result with an empty accessible range', () => {
    const result = view(table, { query: 'no_such_user' })!;
    expect(result.totalRows).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.start).toBe(0);
    expect(result.end).toBe(0);
    expect(result.pages).toBe(1);
  });

  it('does not expose compiler stdin or source code in table metadata', () => {
    expect(Object.keys(table).sort()).toEqual([
      'columns', 'format', 'rows', 'stream', 'truncated', 'warning',
    ]);
  });
});
