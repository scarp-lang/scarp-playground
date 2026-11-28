import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_BUDGET_WARNING_RATIO, WORKSPACE_LONG_LINE_THRESHOLD,
  MAX_BUDGET_LONG_LINES, MAX_BUDGET_FILTER_LENGTH,
  budgetCondition, inspectWorkspaceBudget, filterWorkspaceBudgets,
  type BudgetFilter,
} from '../src/workspace-budget';
import { MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, type Workspace } from '../src/workspace';

const project = (): Workspace => ({
  entry: 'main.srp',
  files: {
    'main.srp': 'import "lib/helper.srp" as helper;\nprint("😀");\n',
    'lib/helper.srp': 'pub bind value = 42;\n',
    'unused.srp': 'print("not reached");\n',
  },
});
const filter = (overrides: Partial<BudgetFilter> = {}): BudgetFilter => ({
  query: '', sortBy: 'path', descending: false, conditions: 'all',
  onlyReachable: false, ...overrides,
});
function report(value = project()) {
  const result = inspectWorkspaceBudget(value);
  if (!result.ok) throw Error(result.error);
  return result;
}

describe('exact local Scarp workspace resource accounting', () => {
  it('reports stable per-file and total UTF-8 quota metadata', () => {
    const workspace = project();
    const result = report(workspace);
    expect(result.fileCount).toBe(3);
    expect(result.entry).toBe('main.srp');
    expect(result.totalBytes).toBe(
      Object.values(workspace.files)
        .reduce((size, text) => size + new TextEncoder().encode(text).byteLength, 0),
    );
    expect(result.byteHeadroom).toBe(MAX_TOTAL_BYTES - result.totalBytes);
    expect(result.availableFileSlots).toBe(MAX_FILES - 3);
    expect(result.quotaFileBytes).toBe(MAX_FILE_BYTES);
  });

  it('counts exact source lines including trailing blank editor lines', () => {
    const result = report();
    expect(result.files.find(file => file.path === 'lib/helper.srp')?.lines).toBe(2);
    expect(result.files.find(file => file.path === 'main.srp')?.lines).toBe(3);
  });

  it('counts an empty source as one logical editor line', () => {
    const result = report({ entry: 'main.srp', files: { 'main.srp': '' } });
    expect(result.totalLines).toBe(1);
    expect(result.files[0].emptyLines).toBe(1);
  });

  it('records CRLF, LF and CR endings separately without normalization', () => {
    const result = report({
      entry: 'main.srp', files: { 'main.srp': 'a\r\nb\nc\rd' },
    });
    expect(result.files[0].newline).toEqual({ crlf: 1, lf: 1, cr: 1 });
    expect(result.files[0].lines).toBe(4);
  });

  it('counts Unicode scalars rather than surrogate halves', () => {
    const result = report({
      entry: 'main.srp', files: { 'main.srp': '😀aह' },
    });
    expect(result.files[0].bytes).toBe(8);
    expect(result.files[0].utf16Units).toBe(4);
    expect(result.files[0].unicodeScalars).toBe(3);
    expect(result.files[0].nonAsciiScalars).toBe(2);
  });

  it('counts non-ASCII scalar characters across the entire workspace', () => {
    const result = report();
    expect(result.totalNonAsciiScalars).toBeGreaterThanOrEqual(1);
    expect(result.totalUnicodeScalars).toBeGreaterThan(result.totalNonAsciiScalars);
  });

  it('reports longest line and its one-based source position', () => {
    const result = report({
      entry: 'main.srp', files: { 'main.srp': 'abc\n' + 'z'.repeat(155) + '\nend' },
    });
    expect(result.files[0].longestLine).toBe(155);
    expect(result.files[0].longestLineAt).toBe(2);
    expect(result.longLines).toEqual([{
      path: 'main.srp', line: 2, units: 155,
    }]);
  });

  it('does not flag a line exactly at the advisory threshold', () => {
    const result = report({
      entry: 'main.srp', files: { 'main.srp': 'x'.repeat(WORKSPACE_LONG_LINE_THRESHOLD) },
    });
    expect(result.longLines).toEqual([]);
  });

  it('caps the number of long-line locations without changing summary metrics', () => {
    const text = ('x'.repeat(145) + '\n').repeat(MAX_BUDGET_LONG_LINES + 6);
    const result = report({ entry: 'main.srp', files: { 'main.srp': text } });
    expect(result.longLines).toHaveLength(MAX_BUDGET_LONG_LINES);
    expect(result.longLinesTruncated).toBe(true);
    expect(result.files[0].lines).toBe(MAX_BUDGET_LONG_LINES + 7);
  });

  it('returns deterministic alphabetically sorted file rows', () => {
    expect(report().files.map(file => file.path)).toEqual([
      'lib/helper.srp', 'main.srp', 'unused.srp',
    ]);
  });

  it('marks the exact existing entrypoint without changing it', () => {
    const result = report();
    expect(result.files.filter(file => file.isEntry).map(file => file.path))
      .toEqual(['main.srp']);
  });

  it('uses the current shared workspace byte and file caps', () => {
    const result = report();
    expect(result.quotaFiles).toBe(MAX_FILES);
    expect(result.quotaTotalBytes).toBe(MAX_TOTAL_BYTES);
    expect(result.quotaFileBytes).toBe(MAX_FILE_BYTES);
  });

  it('applies a normal budget condition below eighty percent', () => {
    expect(budgetCondition(0, 100)).toBe('normal');
    expect(budgetCondition(79, 100)).toBe('normal');
  });

  it('marks a resource as approaching its cap from exactly eighty percent', () => {
    expect(WORKSPACE_BUDGET_WARNING_RATIO).toBe(0.8);
    expect(budgetCondition(80, 100)).toBe('approaching');
    expect(budgetCondition(99, 100)).toBe('approaching');
  });

  it('marks a source as at its hard byte quota rather than overestimating capacity', () => {
    expect(budgetCondition(100, 100)).toBe('at-limit');
    expect(budgetCondition(200, 100)).toBe('at-limit');
    expect(budgetCondition(-1, 100)).toBe('at-limit');
    expect(budgetCondition(10, 0)).toBe('at-limit');
  });

  it('recognizes a near-limit source file by its UTF-8 byte count', () => {
    const result = report({ entry: 'main.srp',
      files: { 'main.srp': 'x'.repeat(Math.ceil(MAX_FILE_BYTES * 0.85)) },
    });
    expect(result.files[0].condition).toBe('approaching');
  });

  it('recognizes when every permitted source file slot is used', () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < MAX_FILES; index++) files['file' + index + '.srp'] = '';
    const result = report({ entry: 'file0.srp', files });
    expect(result.fileCountCondition).toBe('at-limit');
    expect(result.availableFileSlots).toBe(0);
  });

  it('counts incoming and outgoing local import edges without executing Scarp', () => {
    const result = report();
    expect(result.totalImports).toBe(1);
    expect(result.missingImports).toBe(0);
    const main = result.files.find(file => file.path === 'main.srp')!;
    const helper = result.files.find(file => file.path === 'lib/helper.srp')!;
    expect(main.outgoingImports).toBe(1);
    expect(helper.incomingImports).toBe(1);
  });

  it('identifies reachable and disconnected files under a complete lexical graph', () => {
    const result = report();
    expect(result.graphComplete).toBe(true);
    expect(result.files.find(file => file.path === 'main.srp')?.reachableFromEntry).toBe(true);
    expect(result.files.find(file => file.path === 'lib/helper.srp')?.reachableFromEntry).toBe(true);
    expect(result.files.find(file => file.path === 'unused.srp')?.reachableFromEntry).toBe(false);
  });

  it('counts a missing path separately from unsupported import spellings', () => {
    const result = report({ entry: 'main.srp', files: {
      'main.srp': 'import "missing.srp" as missing;\n',
    } });
    expect(result.missingImports).toBe(1);
    expect(result.invalidImports).toBe(0);
  });

  it('does not claim files are unused when local graph inspection is incomplete', () => {
    const result = report({ entry: 'main.srp', files: {
      'main.srp': 'import "\\u{61}.srp" as a;\n',
      'another.srp': 'print(1);',
    } });
    expect(result.graphComplete).toBe(false);
    expect(result.files.every(file => file.reachableFromEntry === null)).toBe(true);
  });

  it('reports lexical import cycles separately from simple reachability', () => {
    const result = report({ entry: 'main.srp', files: {
      'main.srp': 'import "lib/a.srp" as a;\n',
      'lib/a.srp': 'import "../main.srp" as root;\n',
    } });
    expect(result.files.every(file => file.partOfCycle === true)).toBe(true);
  });

  it('rejects malformed workspaces before computing byte totals', () => {
    expect(inspectWorkspaceBudget(null as unknown as Workspace).ok).toBe(false);
    expect(inspectWorkspaceBudget({
      entry: 'main.srp', files: { 'main.srp': '\uD800' },
    }).ok).toBe(false);
  });

  it('does not mutate source files or rewrite their line endings', () => {
    const value = project();
    const original = JSON.stringify(value);
    report(value);
    expect(JSON.stringify(value)).toBe(original);
  });
});

describe('file budget filtering and deterministic sorting', () => {
  const result = report();

  it('finds paths case-insensitively without reading content text', () => {
    expect(filterWorkspaceBudgets(result, filter({ query: 'HELPER' })).map(f => f.path))
      .toEqual(['lib/helper.srp']);
  });

  it('filters to paths reached from the entrypoint', () => {
    const files = filterWorkspaceBudgets(result, filter({ onlyReachable: true }));
    expect(files.map(item => item.path)).toEqual(['lib/helper.srp', 'main.srp']);
  });

  it('sorts source bytes in increasing and decreasing order', () => {
    const asc = filterWorkspaceBudgets(result, filter({ sortBy: 'bytes' }));
    const desc = filterWorkspaceBudgets(result,
      filter({ sortBy: 'bytes', descending: true }));
    expect(asc[0].bytes).toBeLessThanOrEqual(asc.at(-1)!.bytes);
    expect(desc[0].bytes).toBeGreaterThanOrEqual(desc.at(-1)!.bytes);
  });

  it('sorts by the number of outgoing module imports', () => {
    const resultFiles = filterWorkspaceBudgets(result,
      filter({ sortBy: 'imports', descending: true }));
    expect(resultFiles[0].path).toBe('main.srp');
  });

  it('filters by an exact approaching-limit status', () => {
    const near = report({ entry: 'main.srp',
      files: { 'main.srp': 'x'.repeat(Math.floor(MAX_FILE_BYTES * 0.81)) },
    });
    const rows = filterWorkspaceBudgets(near, filter({ conditions: 'approaching' }));
    expect(rows).toHaveLength(1);
    expect(rows[0].condition).toBe('approaching');
  });

  it('rejects malformed filter values without leaking file contents', () => {
    expect(filterWorkspaceBudgets(result, filter({
      query: 'x'.repeat(MAX_BUDGET_FILTER_LENGTH + 1),
    }))).toEqual([]);
    expect(filterWorkspaceBudgets(result, filter({
      sortBy: 'unknown' as BudgetFilter['sortBy'],
    }))).toEqual([]);
    expect(filterWorkspaceBudgets(result, filter({
      descending: 'yes' as unknown as boolean,
    }))).toEqual([]);
  });

  it('retains immutable reports while changing sort order', () => {
    const before = JSON.stringify(result);
    filterWorkspaceBudgets(result, filter({ sortBy: 'bytes', descending: true }));
    expect(JSON.stringify(result)).toBe(before);
  });
});
