import { describe, expect, it } from 'vitest';
import {
  MAX_ADVANCED_QUERY_BYTES, MAX_ADVANCED_SEARCH_TERMS,
  MAX_ADVANCED_SEARCH_GROUPS, MAX_ADVANCED_SOURCE_HITS,
  parseAdvancedSourceQuery, findAdvancedLiteral, advancedSourceSearch,
  type AdvancedSourceSearchOptions,
} from '../src/advanced-source-search';
import type { Workspace } from '../src/workspace';

function workspace(source = 'bind answer = 42;\nprint(answer);\n'): Workspace {
  return { entry: 'main.srp', files: {
    'main.srp': source,
    'lib/math.srp': 'pub funcra add(a, b) { return a + b; }\n',
    'notes.srp': '// TODO: inspect arithmetic\nbind note = "arithmetic";',
  } };
}
function options(query: string, changes: Partial<AdvancedSourceSearchOptions> = {}):
  AdvancedSourceSearchOptions {
  return { query, caseSensitive: false, wholeWord: false, path: 'all', ...changes };
}
function search(query: string, changes: Partial<AdvancedSourceSearchOptions> = {},
  project: Workspace = workspace()) {
  const result = advancedSourceSearch(project, options(query, changes));
  if (!result.ok) throw Error(result.error);
  return result;
}

describe('advanced source-search expression parser', () => {
  it('parses one literal word', () => {
    expect(parseAdvancedSourceQuery('funcra')).toEqual({
      ok: true, positives: 1, exclusions: 0,
      clauses: [{
        positive: [{ text: 'funcra', excluded: false }], negative: [],
      }],
    });
  });

  it('parses implicit AND terms on the same line', () => {
    const parsed = parseAdvancedSourceQuery('pub bind answer');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.clauses[0].positive.map(t => t.text))
      .toEqual(['pub', 'bind', 'answer']);
  });

  it('supports up to four uppercase or lowercase OR clauses', () => {
    const parsed = parseAdvancedSourceQuery('bind or funcra OR repeat Or print');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.clauses).toHaveLength(4);
      expect(parsed.positives).toBe(4);
    }
  });

  it('reads quoted multiword phrases as a single literal term', () => {
    const parsed = parseAdvancedSourceQuery('"pub bind" "my function"');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.clauses[0].positive.map(t => t.text))
      .toEqual(['pub bind', 'my function']);
  });

  it('reads excluded terms and excluded phrases', () => {
    const parsed = parseAdvancedSourceQuery('bind -temporary -"not ready"');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.clauses[0].negative.map(t => t.text))
        .toEqual(['temporary', 'not ready']);
      expect(parsed.exclusions).toBe(2);
    }
  });

  it('treats quoted OR as source content, not a clause separator', () => {
    const parsed = parseAdvancedSourceQuery('"OR" bind');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.clauses).toHaveLength(1);
      expect(parsed.clauses[0].positive[0].text).toBe('OR');
    }
  });

  it('rejects blank, entirely excluded or empty OR clauses', () => {
    for (const query of [
      '', '  ', '-excluded', 'OR foo', 'foo OR', 'foo OR -bar',
      'foo OR OR bar', 'foo OR -bar OR baz',
    ]) expect(parseAdvancedSourceQuery(query).ok).toBe(false);
  });

  it('rejects unterminated, empty or wrongly concatenated phrases', () => {
    for (const query of ['"missing', '""', '" "',
      '"foo"bar', 'foo"bar"', '-', 'term -']) {
      expect(parseAdvancedSourceQuery(query).ok).toBe(false);
    }
  });

  it('supports escaped quote and backslash within a quoted phrase', () => {
    const slash = String.fromCharCode(92);
    const query = '"say ' + slash + '"hello' + slash + '""';
    const parsed = parseAdvancedSourceQuery(query);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.clauses[0].positive[0].text).toBe('say "hello"');
  });

  it('rejects escape sequences that are not part of literal query syntax', () => {
    const slash = String.fromCharCode(92);
    expect(parseAdvancedSourceQuery('"test ' + slash + 'q"').ok).toBe(false);
  });

  it('limits query byte size, term count and alternative clauses', () => {
    const maxTerms = Array.from({ length: MAX_ADVANCED_SEARCH_TERMS },
      (_, index) => 'x' + index).join(' ');
    expect(parseAdvancedSourceQuery(maxTerms).ok).toBe(true);
    expect(parseAdvancedSourceQuery(maxTerms + ' extra').ok).toBe(false);
    expect(parseAdvancedSourceQuery(
      Array.from({ length: MAX_ADVANCED_SEARCH_GROUPS + 1 }, (_, index) => 'x' + index).join(' OR '),
    ).ok).toBe(false);
    const exactEmoji = '😀'.repeat(MAX_ADVANCED_QUERY_BYTES / 4);
    expect(parseAdvancedSourceQuery(exactEmoji).ok).toBe(true);
    expect(parseAdvancedSourceQuery(exactEmoji + '😀').ok).toBe(false);
  });

  it('rejects invalid Unicode without coercing other JavaScript input values', () => {
    expect(parseAdvancedSourceQuery('\uD800').ok).toBe(false);
    expect(parseAdvancedSourceQuery('\uDC00').ok).toBe(false);
    expect(parseAdvancedSourceQuery(44 as unknown as string).ok).toBe(false);
  });
});

describe('literal matching and exact editor coordinates', () => {
  it('returns two non-overlapping UTF-16 ranges', () => {
    expect(findAdvancedLiteral('abc abc', 'abc', true, false)).toEqual([
      { start: 0, end: 3 }, { start: 4, end: 7 },
    ]);
  });

  it('handles case-insensitive matches without changing the source', () => {
    expect(findAdvancedLiteral('ABC abc', 'AbC', false, false)).toEqual([
      { start: 0, end: 3 }, { start: 4, end: 7 },
    ]);
    expect(findAdvancedLiteral('ABC abc', 'AbC', true, false)).toEqual([]);
  });

  it('respects Unicode-aware word boundaries', () => {
    expect(findAdvancedLiteral('foo foobar foo_bar foo', 'foo', false, true)).toEqual([
      { start: 0, end: 3 }, { start: 19, end: 22 },
    ]);
    expect(findAdvancedLiteral('नमस्ते नमस्तेX', 'नमस्ते', true, true))
      .toEqual([{ start: 0, end: 6 }]);
  });

  it('keeps emoji offsets in UTF-16 code units for Monaco', () => {
    expect(findAdvancedLiteral('x😀y😀z', '😀', true, false)).toEqual([
      { start: 1, end: 3 }, { start: 4, end: 6 },
    ]);
  });

  it('maps expanding Unicode lowercase to original one-code-unit positions', () => {
    expect(findAdvancedLiteral('İ', 'i\u0307', false, false))
      .toEqual([{ start: 0, end: 1 }]);
  });

  it('treats punctuation and regex metacharacters literally', () => {
    expect(findAdvancedLiteral('a.b aXb', 'a.b', true, false))
      .toEqual([{ start: 0, end: 3 }]);
    expect(findAdvancedLiteral('test[0]', '[0]', true, false))
      .toEqual([{ start: 4, end: 7 }]);
  });

  it('rejects empty matching terms and bounded zero results', () => {
    expect(findAdvancedLiteral('anything', '', true, false)).toEqual([]);
    expect(findAdvancedLiteral('anything', 'a', true, false, 0)).toEqual([]);
  });

  it('caps occurrences before creating a huge result list', () => {
    expect(findAdvancedLiteral('x'.repeat(10_000), 'x', true, false, 5)).toHaveLength(5);
  });
});

describe('bounded local multi-file source search', () => {
  it('finds literal matches in exact file and line order', () => {
    const report = search('answer');
    expect(report.hits.map(hit => [hit.path, hit.line, hit.column])).toEqual([
      ['main.srp', 1, 6],
      ['main.srp', 2, 7],
    ]);
    expect(report.scannedFiles).toBe(3);
    expect(report.truncated).toBe(false);
  });

  it('can restrict a query to a chosen existing virtual file', () => {
    const report = search('bind', { path: 'notes.srp' });
    expect(report.scannedFiles).toBe(1);
    expect(report.hits.every(hit => hit.path === 'notes.srp')).toBe(true);
  });

  it('requires AND terms to occur on the same source line', () => {
    expect(search('bind print').hits).toEqual([]);
    expect(search('bind answer').hits).toHaveLength(1);
  });

  it('excludes complete source lines with a forbidden term', () => {
    const input = workspace('bind value = 1; // temporary\nbind answer = 2;\n');
    const report = search('bind -temporary', {}, input);
    expect(report.hits.map(hit => hit.line)).toEqual([2, 2]);
  });

  it('deduplicates same-range hits returned by alternative OR clauses', () => {
    const report = search('answer OR answer');
    expect(report.hits).toHaveLength(2);
    expect(report.alternatives).toBe(2);
  });

  it('matches a quoted phrase exactly with punctuation preserved', () => {
    const input = workspace('pub bind a = 1;\npub bind b = 2;');
    const report = search('"pub bind"', {}, input);
    expect(report.hits.filter(hit => hit.path === 'main.srp')).toHaveLength(2);
  });

  it('can distinguish sensitive and insensitive matching', () => {
    const input = workspace('Bind x = 1;\nbind y = 2;');
    expect(search('bind', { caseSensitive: true }, input).hits
      .filter(hit => hit.path === 'main.srp')).toHaveLength(1);
    expect(search('bind', { caseSensitive: false }, input).hits
      .filter(hit => hit.path === 'main.srp')).toHaveLength(2);
  });

  it('supports whole-word matching in source text', () => {
    const input = workspace('foo foobar foo_bar foo');
    expect(search('foo', { wholeWord: true }, input).hits
      .filter(hit => hit.path === 'main.srp')).toHaveLength(2);
  });

  it('keeps line indices accurate through CRLF and CR-only line breaks', () => {
    const input = workspace('x\r\n// TODO: first\ry\n// TODO: second\n');
    expect(search('TODO', {}, input).hits.map(hit => hit.line)).toEqual([2, 4, 1]);
  });

  it('reports emoji match positions in one-based editor columns', () => {
    const input = workspace('print("😀");');
    const report = search('😀', {}, input);
    expect(report.hits[0]).toMatchObject({
      path: 'main.srp', line: 1, column: 8, endColumn: 10,
    });
  });

  it('bounds long source previews and preserves query vicinity', () => {
    const input = workspace('a'.repeat(300) + 'TARGET' + 'b'.repeat(300));
    const report = search('TARGET', {}, input);
    expect(report.hits[0].previewTruncated).toBe(true);
    expect(report.hits[0].preview).toContain('TARGET');
    expect(report.hits[0].preview.length).toBeLessThanOrEqual(184);
  });

  it('never slices an emoji surrogate pair in a preview', () => {
    const input = workspace('😀'.repeat(160) + 'TARGET' + '😀'.repeat(160));
    const report = search('TARGET', {}, input);
    const result = report.hits[0].preview;
    for (let i = 0; i < result.length; i++) {
      const code = result.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        expect(result.charCodeAt(i + 1)).toBeGreaterThanOrEqual(0xdc00);
        expect(result.charCodeAt(i + 1)).toBeLessThanOrEqual(0xdfff);
      }
      if (code >= 0xdc00 && code <= 0xdfff) {
        expect(result.charCodeAt(i - 1)).toBeGreaterThanOrEqual(0xd800);
        expect(result.charCodeAt(i - 1)).toBeLessThanOrEqual(0xdbff);
      }
    }
  });

  it('caps results at 140 and reports incomplete scanning', () => {
    const input = workspace('x '.repeat(MAX_ADVANCED_SOURCE_HITS + 20));
    const report = search('x', {}, input);
    expect(report.hits).toHaveLength(MAX_ADVANCED_SOURCE_HITS);
    expect(report.truncated).toBe(true);
  });

  it('reports no matches for absent source text', () => {
    const report = search('definitely-not-found');
    expect(report.hits).toEqual([]);
    expect(report.truncated).toBe(false);
  });

  it('rejects malformed search scope and runtime flag values', () => {
    const original = workspace();
    expect(advancedSourceSearch(original, options('bind', { path: 'missing.srp' })).ok).toBe(false);
    expect(advancedSourceSearch(original, options('bind', { path: '../escape.srp' })).ok).toBe(false);
    expect(advancedSourceSearch(original, options('bind', {
      wholeWord: 'true' as unknown as boolean,
    })).ok).toBe(false);
  });

  it('rejects invalid workspaces and preserves source immutability', () => {
    const invalid = { entry: 'main.srp', files: { 'main.srp': 42 } };
    expect(advancedSourceSearch(invalid as unknown as Workspace, options('bind')).ok).toBe(false);
    const original = workspace();
    const before = JSON.stringify(original);
    expect(search('bind OR funcra', {}, original).hits.length).toBeGreaterThan(0);
    expect(JSON.stringify(original)).toBe(before);
  });

  it('provides counts separately from source-bearing previews', () => {
    const result = search('PRIVATE', {}, workspace('print("PRIVATE_SOURCE");'));
    const metadata = {
      truncated: result.truncated, scannedLines: result.scannedLines,
      scannedFiles: result.scannedFiles, alternatives: result.alternatives,
    };
    expect(JSON.stringify(metadata)).not.toContain('PRIVATE_SOURCE');
  });
});
