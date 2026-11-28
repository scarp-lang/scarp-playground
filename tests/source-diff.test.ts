import { describe, expect, it } from 'vitest';
import { diffSource, MAX_DIFF_ROWS, MAX_DIFF_LINE_CHARS } from '../src/source-diff';
import { MAX_FILE_BYTES } from '../src/workspace';

describe('bounded line diff', () => {
  it('preserves precise line coordinates and common context', () => {
    const result = diffSource('start\nold\nsame\nend', 'start\nnew\nsame\nextra\nend');
    expect(result.approximate).toBe(false);
    expect(result.rows.map(row => [row.kind, row.before, row.after, row.text, row.ending])).toEqual([
      ['context', 1, 1, 'start', 'LF'],
      ['removed', 2, null, 'old', 'LF'],
      ['added', null, 2, 'new', 'LF'],
      ['context', 3, 3, 'same', 'LF'],
      ['added', null, 4, 'extra', 'LF'],
      ['context', 4, 5, 'end', 'EOF'],
    ]);
  });
  it('treats CRLF, CR, LF and EOF as distinct and preserves blank lines', () => {
    const result = diffSource('a\r\n\r\nb\r', 'a\n\nb');
    expect(result.rows.filter(row => row.kind === 'removed').map(row => row.ending)).toEqual(['CRLF', 'CRLF', 'CR']);
    expect(result.rows.filter(row => row.kind === 'added').map(row => row.ending)).toEqual(['LF', 'LF', 'EOF']);
    expect(result.rows.some(row => row.text === '')).toBe(true);
    expect(diffSource('a', 'a\n').rows.map(row => row.ending)).toEqual(['EOF', 'LF']);
  });
  it('represents added and removed files without invented empty lines', () => {
    expect(diffSource(null, 'a\n').rows.map(row => row.kind)).toEqual(['added']);
    expect(diffSource('a\n', null).rows.map(row => row.kind)).toEqual(['removed']);
    expect(diffSource(null, '').rows).toEqual([]);
    expect(diffSource('', '').rows).toEqual([]);
  });
  it('keeps the change visible after large unchanged prefixes and suffixes', () => {
    const prefix = 'same\n'.repeat(500);
    const suffix = 'tail\n'.repeat(500);
    const result = diffSource(prefix + 'old\n' + suffix, prefix + 'new\n' + suffix);
    expect(result.rows).toHaveLength(8);
    expect(result.omitted).toBe(994);
    expect(result.rows[3]).toMatchObject({ kind: 'removed', before: 501, text: 'old' });
    expect(result.rows[4]).toMatchObject({ kind: 'added', after: 501, text: 'new' });
  });
  it('bounds large changed regions and labels non-minimal fallback', () => {
    const result = diffSource('old\n'.repeat(500), 'new\n'.repeat(500));
    expect(result.approximate).toBe(true);
    expect(result.rows).toHaveLength(MAX_DIFF_ROWS);
    expect(result.omitted).toBe(1000 - MAX_DIFF_ROWS);
  });
  it('truncates long line previews without splitting surrogate pairs', () => {
    const long = 'x'.repeat(MAX_DIFF_LINE_CHARS - 1) + '😀' + 'tail';
    const result = diffSource(null, long);
    expect(result.rows[0]).toMatchObject({ text: 'x'.repeat(MAX_DIFF_LINE_CHARS - 1), truncated: true });
    expect(diffSource(null, 'x'.repeat(MAX_FILE_BYTES + 1)).error).not.toBeNull();
    expect(diffSource(null, '😀'.repeat(MAX_FILE_BYTES / 4 + 1)).error).not.toBeNull();
  });
});
