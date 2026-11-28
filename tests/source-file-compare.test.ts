import { describe, expect, it } from 'vitest';
import {
  MAX_COMPARE_CONTEXT, MAX_COMPARE_MATRIX_CELLS,
  MAX_COMPARE_DISPLAY_ROWS, MAX_COMPARE_TEXT_BYTES,
  compareWorkspaceFiles, splitCompareLines, textFileComparison,
  type FileComparisonOptions,
} from '../src/source-file-compare';
import type { Workspace } from '../src/workspace';

function workspace(left: string, right: string): Workspace {
  return {
    entry: 'main.srp',
    files: { 'main.srp': left, 'lib/other.srp': right },
  };
}
function options(changes: Partial<FileComparisonOptions> = {}): FileComparisonOptions {
  return {
    left: 'main.srp',
    right: 'lib/other.srp',
    ignoreLineEndings: false,
    ignoreTrailingWhitespace: false,
    context: 2,
    ...changes,
  };
}
function compare(left: string, right: string, opts = options()) {
  const result = compareWorkspaceFiles(workspace(left, right), opts);
  if (!result.ok) throw Error(result.error);
  return result;
}

describe('line-preserving Scarp source comparison', () => {
  it('splits all three newline styles with intact separators and offsets', () => {
    expect(splitCompareLines('a\r\nb\rc\nd')).toEqual([
      { body: 'a', newline: '\r\n', number: 1, start: 0 },
      { body: 'b', newline: '\r', number: 2, start: 3 },
      { body: 'c', newline: '\n', number: 3, start: 5 },
      { body: 'd', newline: '', number: 4, start: 7 },
    ]);
  });

  it('retains trailing blank editor lines after a final newline', () => {
    expect(splitCompareLines('x\n')).toEqual([
      { body: 'x', newline: '\n', number: 1, start: 0 },
      { body: '', newline: '', number: 2, start: 2 },
    ]);
  });

  it('counts an empty source as one addressable editor line', () => {
    expect(splitCompareLines('')).toEqual([
      { body: '', newline: '', number: 1, start: 0 },
    ]);
  });

  it('reports no changes when files have identical contents', () => {
    const report = compare('print(1);\n', 'print(1);\n');
    expect(report.identical).toBe(true);
    expect(report.changed).toBe(0);
    expect(report.added).toBe(0);
    expect(report.removed).toBe(0);
    expect(report.hunks).toEqual([]);
    expect(report.matching).toBe(2);
  });

  it('represents a single-line edit as one changed row', () => {
    const report = compare('print(1);\n', 'print(2);\n');
    expect(report.changed).toBe(1);
    expect(report.added).toBe(0);
    expect(report.removed).toBe(0);
    const row = report.hunks[0].rows.find(item => item.kind === 'changed');
    expect(row).toMatchObject({
      leftLine: 1, rightLine: 1,
      leftText: 'print(1);', rightText: 'print(2);',
    });
  });

  it('shows the original source-line number after lines were added', () => {
    const report = compare('a\nb\n', 'a\nINSERTED\nb\n');
    expect(report.added).toBe(1);
    expect(report.changed).toBe(0);
    expect(report.hunks[0].rows.find(row => row.kind === 'added')).toMatchObject({
      leftLine: null, rightLine: 2, rightText: 'INSERTED',
    });
  });

  it('reports a removed source line without inventing a replacement line', () => {
    const report = compare('a\nREMOVE\nb\n', 'a\nb\n');
    expect(report.removed).toBe(1);
    expect(report.changed).toBe(0);
    expect(report.hunks[0].rows.find(row => row.kind === 'removed')).toMatchObject({
      leftLine: 2, rightLine: null, leftText: 'REMOVE',
    });
  });

  it('pairs contiguous deletions and additions into readable changed rows', () => {
    const report = compare('old1\nold2\ntail\n', 'new1\nnew2\ntail\n');
    expect(report.changed).toBe(2);
    expect(report.added).toBe(0);
    expect(report.removed).toBe(0);
    const edited = report.hunks[0].rows.filter(row => row.kind === 'changed');
    expect(edited.map(row => row.rightText)).toEqual(['new1', 'new2']);
  });

  it('leaves surplus unmatched left lines as removals', () => {
    const report = compare('one\ntwo\nthree\ntail\n', 'four\ntail\n');
    expect(report.changed).toBe(1);
    expect(report.removed).toBe(2);
    expect(report.added).toBe(0);
  });

  it('leaves surplus unmatched right lines as additions', () => {
    const report = compare('one\ntail\n', 'four\nfive\nsix\ntail\n');
    expect(report.changed).toBe(1);
    expect(report.added).toBe(2);
    expect(report.removed).toBe(0);
  });

  it('recognizes repeated source lines without duplicating records', () => {
    const report = compare('a\nb\na\n', 'a\na\n');
    expect(report.removed).toBe(1);
    expect(report.changed).toBe(0);
    expect(report.matching).toBe(3);
  });

  it('reports newline-only differences by default', () => {
    const report = compare('print(1);\r\n', 'print(1);\n');
    expect(report.changed).toBe(1);
    expect(report.identical).toBe(false);
  });

  it('can ignore line endings without mutating either buffer', () => {
    const left = 'print(1);\r\n', right = 'print(1);\n';
    const report = compare(left, right, options({ ignoreLineEndings: true }));
    expect(report.identical).toBe(true);
    expect(workspace(left, right).files['main.srp']).toBe(left);
  });

  it('recognizes trailing-whitespace-only edits', () => {
    const report = compare('bind a = 1;  \n', 'bind a = 1;\n');
    expect(report.changed).toBe(1);
    expect(compare('bind a = 1;  \n', 'bind a = 1;\n',
      options({ ignoreTrailingWhitespace: true })).identical).toBe(true);
  });

  it('does not ignore indentation or interior whitespace under trailing mode', () => {
    const result = compare(' bind a = 1;\n', 'bind a = 1;\n',
      options({ ignoreTrailingWhitespace: true }));
    expect(result.identical).toBe(false);
  });

  it('can ignore trailing whitespace and line ending differences independently', () => {
    const left = 'print(1);  \r\n';
    const right = 'print(1);\n';
    expect(compare(left, right, options({ ignoreLineEndings: true })).identical).toBe(false);
    expect(compare(left, right, options({ ignoreTrailingWhitespace: true })).identical).toBe(false);
    expect(compare(left, right, options({
      ignoreTrailingWhitespace: true, ignoreLineEndings: true,
    })).identical).toBe(true);
  });

  it('compares a file containing Hindi and emoji without changing Unicode text', () => {
    const report = compare('print("😀 हिंदी");\n', 'print("😀 हिन्दी");\n');
    expect(report.changed).toBe(1);
    expect(report.hunks[0].rows[0].leftText).toBe('print("😀 हिंदी");');
  });

  it('treats an unmatched UTF-8 byte sequence as an invalid workspace', () => {
    expect(compareWorkspaceFiles(workspace('\uD800', 'hello'), options()).ok).toBe(false);
  });

  it('rejects comparing a file with itself or a nonexistent file', () => {
    expect(compareWorkspaceFiles(workspace('a', 'b'), options({
      right: 'main.srp',
    })).ok).toBe(false);
    expect(compareWorkspaceFiles(workspace('a', 'b'), options({
      right: 'lib/missing.srp',
    })).ok).toBe(false);
    expect(compareWorkspaceFiles(workspace('a', 'b'), options({
      left: '../unsafe.srp',
    })).ok).toBe(false);
  });

  it('rejects malformed context values and unsupported option types', () => {
    for (const context of [-1, 1.5, MAX_COMPARE_CONTEXT + 1, Number.NaN]) {
      expect(compareWorkspaceFiles(workspace('a', 'b'),
        options({ context })).ok).toBe(false);
    }
    expect(compareWorkspaceFiles(workspace('a', 'b'), options({
      ignoreLineEndings: 'yes' as unknown as boolean,
    })).ok).toBe(false);
  });

  it('limits the dynamic programming matrix before it allocates memory', () => {
    const source = 'line\n'.repeat(1800);
    const report = compareWorkspaceFiles(workspace(source, source), options());
    expect(report.ok).toBe(false);
    if (!report.ok) expect(report.error).toContain('bounded diff matrix');
    expect((1801 * 1801)).toBeGreaterThan(MAX_COMPARE_MATRIX_CELLS);
  });

  it('can still compare many lines against a small one-line file', () => {
    const source = 'a\n'.repeat(1000);
    const report = compare(source, '');
    expect(report.removed).toBeGreaterThan(900);
    expect(report.truncated).toBe(true);
  });

  it('merges nearby hunks when unchanged context ranges touch', () => {
    const left = Array.from({ length: 12 }, (_, i) => 'line' + i);
    const right = [...left];
    right[2] = 'changed2';
    right[6] = 'changed6';
    const report = compare(left.join('\n'), right.join('\n'),
      options({ context: 2 }));
    expect(report.hunks).toHaveLength(1);
    expect(report.changed).toBe(2);
  });

  it('keeps separate hunks when context does not reach adjacent changes', () => {
    const left = Array.from({ length: 24 }, (_, i) => 'line' + i);
    const right = [...left];
    right[2] = 'changed2';
    right[21] = 'changed21';
    const report = compare(left.join('\n'), right.join('\n'), options({ context: 1 }));
    expect(report.hunks).toHaveLength(2);
  });

  it('shows no unchanged context lines when configured with zero context', () => {
    const report = compare('one\ntwo\nthree\n', 'one\nCHANGE\nthree\n',
      options({ context: 0 }));
    expect(report.hunks).toHaveLength(1);
    expect(report.hunks[0].rows.every(row => row.kind === 'changed')).toBe(true);
  });

  it('computes summary counts across all changes even if preview rows are truncated', () => {
    const left = Array.from({ length: 900 }, (_, i) => 'left' + i).join('\n');
    const right = Array.from({ length: 900 }, (_, i) => 'right' + i).join('\n');
    const report = compare(left, right, options({ context: 0 }));
    expect(report.changed).toBe(900);
    expect(report.truncated).toBe(true);
    const rendered = report.hunks.flatMap(hunk => hunk.rows);
    expect(rendered.length).toBeLessThanOrEqual(MAX_COMPARE_DISPLAY_ROWS);
  });

  it('works with empty lines inserted in the middle of a program', () => {
    const result = compare('a\nb\n', 'a\n\nb\n');
    expect(result.added).toBe(1);
    expect(result.hunks.flatMap(h => h.rows).some(row =>
      row.kind === 'added' && row.rightText === '')).toBe(true);
  });

  it('detects the difference between no trailing newline and a final newline', () => {
    const report = compare('a', 'a\n');
    expect(report.identical).toBe(false);
    expect(report.changed).toBeGreaterThanOrEqual(1);
  });
});

describe('bounded textual review excerpt', () => {
  it('uses stable headers and options labels', () => {
    const report = compare('before\n', 'after\n');
    const text = textFileComparison(report)!;
    expect(text).toContain('Scarp source file comparison');
    expect(text).toContain('Left: main.srp');
    expect(text).toContain('Right: lib/other.srp');
    expect(text).toContain('-before');
    expect(text).toContain('+after');
  });

  it('renders a same-line text replacement in unified-style minus/plus lines', () => {
    const report = compare('bind x = 1;\n', 'bind x = 2;\n');
    expect(textFileComparison(report)).toContain('-bind x = 1;\n+bind x = 2;');
  });

  it('prints a complete change header with source-side hunk coordinates', () => {
    const report = compare('a\nb\n', 'a\nc\n');
    expect(textFileComparison(report)).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
  });

  it('returns a metadata-only excerpt for identical source', () => {
    const report = compare('a\n', 'a\n');
    const text = textFileComparison(report)!;
    expect(text).toContain('Unchanged: 2, added: 0, removed: 0, changed: 0');
    expect(text).not.toContain('@@');
  });

  it('marks incomplete preview excerpts instead of implying they are complete patches', () => {
    const left = Array.from({ length: 900 }, (_, i) => 'left' + i).join('\n');
    const right = Array.from({ length: 900 }, (_, i) => 'right' + i).join('\n');
    const report = compare(left, right, options({ context: 0 }));
    const text = textFileComparison(report)!;
    expect(text).toContain('comparison excerpt is truncated');
  });

  it('caps long textual previews and does not export the entire source', () => {
    const huge = '🙂'.repeat(7000);
    const report = compare(huge, 'short');
    const text = textFileComparison(report)!;
    expect(text.length).toBeLessThanOrEqual(MAX_COMPARE_TEXT_BYTES + 500);
  });

  it('does not expose runtime input, compiler stdout or browser configuration', () => {
    const report = compare('print(1);', 'print(2);');
    const text = textFileComparison(report)!;
    expect(text).not.toContain('allowPrompts');
    expect(Object.keys(report).sort()).toEqual([
      'added', 'changed', 'hunks', 'identical', 'left', 'leftLines',
      'matching', 'ok', 'options', 'removed', 'right', 'rightLines', 'rows', 'truncated',
    ]);
  });

  it('refuses export for an invalid comparison result', () => {
    const result = compareWorkspaceFiles(workspace('a', 'b'), options({
      right: 'missing.srp',
    }));
    expect(textFileComparison(result)).toBeNull();
  });
});
