import { describe, expect, it } from 'vitest';
import { MAX_QUICK_OPEN_QUERY, quickOpenFiles } from '../src/quick-open';

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
    expect(quickOpenFiles(paths, 'math', 'main.srp').map(x => x.path)).toEqual([
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
