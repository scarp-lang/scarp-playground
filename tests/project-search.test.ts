import { describe, expect, it } from 'vitest';
import { MAX_SEARCH_QUERY, MAX_SEARCH_RESULTS, searchProjectFiles } from '../src/project-search';

describe('local Scarp project search', () => {
  it('sorts files, finds case-insensitive literals, and reports 1-based positions', () => {
    const result = searchProjectFiles({
      'z.srp': 'PRINT("second");\nprint(2);',
      'a.srp': 'print("first");',
    }, 'print');
    expect(result.truncated).toBe(false);
    expect(result.matches.map(({ path, line, column }) => [path, line, column])).toEqual([
      ['a.srp', 1, 1], ['z.srp', 1, 1], ['z.srp', 2, 1],
    ]);
  });

  it('treats the search text as literal, not a regular expression', () => {
    const result = searchProjectFiles({
      'main.srp': 'print("a.b");\nprint("a-b");\nprint("a.b");',
    }, 'a.b');
    expect(result.matches.map(x => x.line)).toEqual([1, 3]);
  });

  it('preserves Monaco UTF-16 columns after emoji and CRLF lines', () => {
    const result = searchProjectFiles({
      'main.srp': 'print("😀 नमस्ते");\r\n😀😀x here\rthird here',
    }, 'here');
    expect(result.matches.map(x => [x.line, x.column])).toEqual([[2, 6], [3, 7]]);
  });

  it('excludes invalid virtual paths and never searches across lines', () => {
    const result = searchProjectFiles({
      '../secret.srp': 'needle',
      'main.srp': 'nee\ndle\nneedle',
    }, 'needle');
    expect(result.matches.map(x => x.path + ':' + x.line)).toEqual(['main.srp:3']);
  });

  it('bounds query and result volume without partial-file leaks', () => {
    expect(searchProjectFiles({ 'main.srp': 'x'.repeat(200) }, 'x').matches).toEqual([]);
    expect(searchProjectFiles({ 'main.srp': 'xxxx' }, 'x'.repeat(MAX_SEARCH_QUERY + 1)).matches).toEqual([]);
    const result = searchProjectFiles({ 'main.srp': 'aa '.repeat(MAX_SEARCH_RESULTS + 10) }, 'aa');
    expect(result.matches).toHaveLength(MAX_SEARCH_RESULTS);
    expect(result.truncated).toBe(true);
    expect(result.matches[0].column).toBe(1);
    expect(result.matches.at(-1)?.column).toBe(1 + (MAX_SEARCH_RESULTS - 1) * 3);
  });

  it('shows bounded context surrounding long-line matches', () => {
    const result = searchProjectFiles({
      'main.srp': 'a'.repeat(250) + 'target' + 'b'.repeat(250),
    }, 'target');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].preview).toContain('target');
    expect(result.matches[0].preview.length).toBeLessThan(130);
    expect(result.matches[0].preview.startsWith('…')).toBe(true);
  });
});
