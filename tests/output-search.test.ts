import { describe, expect, it } from 'vitest';
import {
  MAX_OUTPUT_SEARCH_QUERY_BYTES, MAX_OUTPUT_SEARCH_RESULTS,
  MAX_OUTPUT_SEARCH_LINES, MAX_OUTPUT_SEARCH_SNIPPET,
  searchOutputLine, searchProgramOutput, type OutputSearchOptions,
} from '../src/output-search';
import { MAX_OUTPUT_BYTES } from '../src/runner/protocol';

const opts = (query: string, changes: Partial<OutputSearchOptions> = {}): OutputSearchOptions => ({
  query,
  caseSensitive: false,
  wholeWord: false,
  includeStdout: true,
  includeStderr: true,
  ...changes,
});
function success(stdout: string, stderr: string, query: string,
  changes: Partial<OutputSearchOptions> = {}) {
  const result = searchProgramOutput(stdout, stderr, opts(query, changes));
  if (!result.ok) throw Error(result.error);
  return result;
}

describe('literal output search with safe Unicode coordinates', () => {
  it('identifies all non-overlapping exact source-code-unit positions', () => {
    expect(searchOutputLine('abc abc', 'abc', true, false, 5)).toEqual([
      { start: 0, end: 3 }, { start: 4, end: 7 },
    ]);
  });

  it('supports case-insensitive matches without changing output', () => {
    expect(searchOutputLine('HELLO hello', 'HeLlO', false, false, 5)).toEqual([
      { start: 0, end: 5 }, { start: 6, end: 11 },
    ]);
    expect(searchOutputLine('HELLO hello', 'HeLlO', true, false, 5)).toEqual([]);
  });

  it('supports Unicode whole-word boundaries in mixed-language output', () => {
    expect(searchOutputLine('foo foobar foo_bar foo', 'foo', false, true, 10)).toEqual([
      { start: 0, end: 3 }, { start: 19, end: 22 },
    ]);
    expect(searchOutputLine('नमस्ते नमस्तेX', 'नमस्ते', true, true, 5))
      .toEqual([{ start: 0, end: 6 }]);
  });

  it('preserves Monaco UTF-16 positions when searching emoji output', () => {
    expect(searchOutputLine('a😀b😀c', '😀', true, false, 10)).toEqual([
      { start: 1, end: 3 }, { start: 4, end: 6 },
    ]);
  });

  it('maps expanding Unicode lowercase to the original scalar boundaries', () => {
    expect(searchOutputLine('İ', 'i\u0307', false, false, 5))
      .toEqual([{ start: 0, end: 1 }]);
  });

  it('treats regex punctuation and brackets as literal text', () => {
    expect(searchOutputLine('a.b aXb [0]', 'a.b', true, false, 10)).toEqual([
      { start: 0, end: 3 },
    ]);
    expect(searchOutputLine('[0] [1]', '[0]', true, false, 10)).toEqual([
      { start: 0, end: 3 },
    ]);
  });

  it('rejects empty or disabled literal match scans', () => {
    expect(searchOutputLine('abc', '', true, false, 10)).toEqual([]);
    expect(searchOutputLine('abc', 'a', true, false, 0)).toEqual([]);
    expect(searchOutputLine('abc', 'missing', true, false, 10)).toEqual([]);
  });

  it('caps matches on a single extremely long line', () => {
    expect(searchOutputLine('x'.repeat(20_000), 'x', true, false, 7)).toHaveLength(7);
  });
});

describe('bounded, source-independent compiler output searches', () => {
  it('finds stdout and stderr separately with stream labels', () => {
    const report = success('answer 42\n', 'warning: answer 42\n', 'answer');
    expect(report.hits).toHaveLength(2);
    expect(report.hits.map(hit => hit.stream)).toEqual(['stdout', 'stderr']);
    expect(report.hits.map(hit => hit.line)).toEqual([1, 1]);
    expect(report.streamsSearched).toBe(2);
  });

  it('records exact one-based line and column numbers', () => {
    const report = success('first\nsecond\nsecond', '', 'second');
    expect(report.hits.map(hit => [hit.line, hit.column, hit.endColumn]))
      .toEqual([[2, 1, 7], [3, 1, 7]]);
  });

  it('treats CRLF as one newline and also supports CR-only output', () => {
    const report = success('a\r\nb\rc\nd', '', 'c');
    expect(report.hits).toHaveLength(1);
    expect(report.hits[0].line).toBe(3);
    expect(report.hits[0].column).toBe(1);
  });

  it('finds a Unicode string without splitting its surrogate pair', () => {
    const report = success('😀 नमस्ते 😀\n', '', '😀');
    expect(report.hits.map(hit => [hit.line, hit.column, hit.endColumn]))
      .toEqual([[1, 1, 3], [1, 11, 13]]);
  });

  it('filters stderr out of a search when requested', () => {
    const report = success('OK\n', 'ERROR\n', 'error', { includeStderr: false });
    expect(report.hits).toEqual([]);
    expect(report.streamsSearched).toBe(1);
  });

  it('filters stdout out of a search when requested', () => {
    const report = success('OK\n', 'ERROR\n', 'error', { includeStdout: false });
    expect(report.hits).toHaveLength(1);
    expect(report.hits[0].stream).toBe('stderr');
  });

  it('does not require success of an underlying program to search stderr text', () => {
    const report = success('', 'Execution error: missing module', 'missing');
    expect(report.hits).toHaveLength(1);
    expect(report.hits[0].stream).toBe('stderr');
  });

  it('keeps the original source text out of search-result metadata', () => {
    const report = success('SECRET_OUTPUT_TOKEN', '', 'TOKEN');
    const { processedLines, streamsSearched, truncated, reason } = report;
    expect(JSON.stringify({ processedLines, streamsSearched, truncated, reason }))
      .not.toContain('SECRET');
    expect(report.hits[0].match).toBe('TOKEN');
  });

  it('does not modify either stream during a search', () => {
    const stdout = '😀\r\nprint(1);';
    const stderr = 'warning: 123';
    const report = success(stdout, stderr, 'print');
    expect(report.hits).toHaveLength(1);
    expect(stdout).toBe('😀\r\nprint(1);');
    expect(stderr).toBe('warning: 123');
  });

  it('returns no matches when both selected streams are empty', () => {
    const report = success('', '', 'query');
    expect(report.hits).toEqual([]);
    expect(report.processedLines).toBe(0);
  });

  it('detects repeated matches but never returns more than 160', () => {
    const report = success('x '.repeat(MAX_OUTPUT_SEARCH_RESULTS + 20), '', 'x');
    expect(report.hits).toHaveLength(MAX_OUTPUT_SEARCH_RESULTS);
    expect(report.truncated).toBe(true);
    expect(report.reason).toBe('matches');
  });

  it('bounds output scanning at 20,000 lines without allocating a giant line array', () => {
    const report = success('line\n'.repeat(MAX_OUTPUT_SEARCH_LINES + 30), '', 'not-found');
    expect(report.hits).toHaveLength(0);
    expect(report.processedLines).toBe(MAX_OUTPUT_SEARCH_LINES);
    expect(report.truncated).toBe(true);
    expect(report.reason).toBe('lines');
  });

  it('creates bounded highlights for a long output line', () => {
    const source = 'a'.repeat(350) + 'TARGET' + 'b'.repeat(350);
    const report = success(source, '', 'TARGET');
    expect(report.hits).toHaveLength(1);
    const hit = report.hits[0];
    expect(hit.match).toBe('TARGET');
    expect(hit.omittedBefore).toBe(true);
    expect(hit.omittedAfter).toBe(true);
    expect((hit.before + hit.match + hit.after).length)
      .toBeLessThanOrEqual(MAX_OUTPUT_SEARCH_SNIPPET + 1);
  });

  it('keeps UTF-16 surrogate pairs complete inside a preview window', () => {
    const report = success('😀'.repeat(200) + 'TARGET' + '😀'.repeat(200), '', 'TARGET');
    const hit = report.hits[0];
    const value = hit.before + hit.match + hit.after;
    expect(value).toContain('TARGET');
    for (let index = 0; index < value.length; index++) {
      const point = value.charCodeAt(index);
      if (point >= 0xd800 && point <= 0xdbff) {
        expect(value.charCodeAt(index + 1)).toBeGreaterThanOrEqual(0xdc00);
        expect(value.charCodeAt(index + 1)).toBeLessThanOrEqual(0xdfff);
      }
      if (point >= 0xdc00 && point <= 0xdfff) {
        expect(value.charCodeAt(index - 1)).toBeGreaterThanOrEqual(0xd800);
        expect(value.charCodeAt(index - 1)).toBeLessThanOrEqual(0xdbff);
      }
    }
  });

  it('rejects a 121-byte query without trying to scan the output', () => {
    expect(searchProgramOutput('hello', '', opts('x'.repeat(MAX_OUTPUT_SEARCH_QUERY_BYTES + 1))).ok)
      .toBe(false);
  });

  it('rejects multiline queries and invalid Unicode query text', () => {
    for (const query of ['foo\nbar', '\uD800', '\uDC00', '']) {
      expect(searchProgramOutput('foo', '', opts(query)).ok).toBe(false);
    }
  });

  it('rejects non-string output and oversized compiler responses', () => {
    expect(searchProgramOutput(33, '', opts('3')).ok).toBe(false);
    expect(searchProgramOutput('', {}, opts('test')).ok).toBe(false);
    expect(searchProgramOutput('x'.repeat(MAX_OUTPUT_BYTES + 1), '', opts('x')).ok)
      .toBe(false);
  });

  it('rejects invalid Unicode output rather than normalizing malformed bytes', () => {
    expect(searchProgramOutput('\uD800', '', opts('test')).ok).toBe(false);
    expect(searchProgramOutput('', '\uDC00', opts('test')).ok).toBe(false);
  });

  it('requires at least one selected output stream', () => {
    expect(searchProgramOutput('text', 'error', opts('text', {
      includeStdout: false, includeStderr: false,
    })).ok).toBe(false);
  });

  it('refuses invalid runtime option types without silently coercing booleans', () => {
    const invalid = [
      { caseSensitive: 'false' as unknown as boolean },
      { wholeWord: 1 as unknown as boolean },
      { includeStderr: null as unknown as boolean },
    ];
    for (const options of invalid) {
      expect(searchProgramOutput('hello', 'error', opts('hello', options)).ok).toBe(false);
    }
  });

  it('matches output case sensitivity settings exactly', () => {
    expect(success('Foo foo FOO', '', 'foo', { caseSensitive: true }).hits).toHaveLength(1);
    expect(success('Foo foo FOO', '', 'foo', { caseSensitive: false }).hits).toHaveLength(3);
  });

  it('respects whole-word boundaries for identifier-shaped output', () => {
    const report = success('foo foobar foo_bar foo', '', 'foo', { wholeWord: true });
    expect(report.hits.map(hit => hit.column)).toEqual([1, 20]);
  });
});
