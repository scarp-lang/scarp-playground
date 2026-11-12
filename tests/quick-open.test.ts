import { describe, expect, it } from 'vitest';
import { MAX_QUICK_OPEN_QUERY, quickOpenFiles, parseQuickOpenQuery, quickOpenPosition } from '../src/quick-open';

const paths = ['lib/math.srp', 'app/main.srp', 'main.srp', 'lib/matrix.srp', 'examples/print.srp'];

describe('offline Scarp quick-open path ranking', () => {
  it('shows the entry first when the query is empty', () => {
    const result = quickOpenFiles(paths, '', 'main.srp');
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({
      path: 'main.srp', name: 'main.srp', directory: '', entry: true,
    });
    expect(result[1].path).toBe('app/main.srp');
  });

  it('ranks exact basename and path matches before partial matches', () => {
    expect(quickOpenFiles(paths, 'math.srp', 'main.srp')[0].path).toBe('lib/math.srp');
    expect(quickOpenFiles(paths, 'lib/math.srp', 'main.srp')[0].path).toBe('lib/math.srp');
    expect(quickOpenFiles(paths, 'mat', 'main.srp').map(x => x.path)).toEqual([
      'lib/math.srp', 'lib/matrix.srp',
    ]);
  });

  it('supports case-insensitive searching and Windows-style input separators', () => {
    expect(quickOpenFiles(paths, 'LIB\\MATH', 'main.srp').map(x => x.path))
      .toEqual(['lib/math.srp']);
    expect(quickOpenFiles(paths, 'PRINT.SRP', 'main.srp')[0]).toEqual({
      path: 'examples/print.srp', name: 'print.srp', directory: 'examples', entry: false,
    });
  });

  it('rejects invalid paths, deduplicates inputs and bounds query size', () => {
    expect(quickOpenFiles(['main.srp', 'main.srp', '../secrets.srp', 'code.js'], '', 'main.srp'))
      .toHaveLength(1);
    expect(quickOpenFiles(paths, 'nothing', 'main.srp')).toEqual([]);
    expect(quickOpenFiles(paths, 'x'.repeat(MAX_QUICK_OPEN_QUERY + 1), 'main.srp'))
      .toEqual([]);
  });

  it('is deterministic independent of source array ordering', () => {
    expect(quickOpenFiles(paths, '', 'main.srp')).toEqual(
      quickOpenFiles([...paths].reverse(), '', 'main.srp'),
    );
    expect(quickOpenFiles(paths, 'm', 'main.srp')).toEqual(
      quickOpenFiles([...paths].reverse(), 'm', 'main.srp'),
    );
  });
});


describe('bounded Quick Open source-position addresses', () => {
  it('parses relative file and active-file line/column addresses', () => {
    expect(parseQuickOpenQuery(' lib\\math.srp:12:4 ')).toEqual({
      filter: 'lib\\math.srp', line: 12, column: 4, activeFileOnly: false,
    });
    expect(parseQuickOpenQuery(':8')).toEqual({
      filter: '', line: 8, column: null, activeFileOnly: true,
    });
    expect(parseQuickOpenQuery(':8:2')).toEqual({
      filter: '', line: 8, column: 2, activeFileOnly: true,
    });
    expect(parseQuickOpenQuery('math')).toEqual({
      filter: 'math', line: null, column: null, activeFileOnly: false,
    });
    expect(parseQuickOpenQuery('')).toEqual({
      filter: '', line: null, column: null, activeFileOnly: false,
    });
  });

  it('rejects invalid, ambiguous, unsafe, or unbounded line addresses', () => {
    for (const query of [
      ':', 'main.srp:', ':0', 'main.srp:0', 'main.srp:1:0',
      'math.srp:-1', 'math.srp:1:-1', 'math.srp:1:2:3',
      'main.srp:1234567', 'main.srp:1:1234567', 'name:NaN',
      'a'.repeat(MAX_QUICK_OPEN_QUERY + 1),
    ]) {
      expect(parseQuickOpenQuery(query)).toBeNull();
    }
  });

  it('clamps positions to real file bounds without splitting astral Unicode', () => {
    const source = 'hello\r\n😀end\n';
    expect(quickOpenPosition(source, 200, 999)).toEqual({ line: 3, column: 1 });
    expect(quickOpenPosition(source, 1, 300)).toEqual({ line: 1, column: 6 });
    expect(quickOpenPosition(source, 2, 2)).toEqual({ line: 2, column: 3 });
    expect(quickOpenPosition(source, 2, 3)).toEqual({ line: 2, column: 3 });
    expect(quickOpenPosition(source, 2, null)).toEqual({ line: 2, column: 1 });
  });
});
