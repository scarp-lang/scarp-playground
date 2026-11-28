import { isUtf8Text } from './utf8';
import { validateWorkspace, validPath, type Workspace } from './workspace';

export const MAX_ADVANCED_QUERY_BYTES = 256;
export const MAX_ADVANCED_SEARCH_TERMS = 12;
export const MAX_ADVANCED_SEARCH_GROUPS = 4;
export const MAX_ADVANCED_SOURCE_HITS = 140;
export const MAX_ADVANCED_SOURCE_PREVIEW = 180;

export type SearchTerm = Readonly<{ text: string; excluded: boolean }>;
export type SearchClause = Readonly<{ positive: SearchTerm[]; negative: SearchTerm[] }>;

export type ParsedAdvancedQuery =
  | { ok: true; clauses: SearchClause[]; positives: number; exclusions: number }
  | { ok: false; error: string };

export type AdvancedSourceSearchOptions = Readonly<{
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  path: 'all' | string;
}>;

export type AdvancedSourceHit = Readonly<{
  path: string;
  line: number;
  column: number;
  endColumn: number;
  clause: number;
  preview: string;
  previewTruncated: boolean;
}>;

export type AdvancedSourceSearchResult =
  | { ok: true; hits: AdvancedSourceHit[]; truncated: boolean;
      scannedFiles: number; scannedLines: number; alternatives: number }
  | { ok: false; error: string };

type Token = { value: string; excluded: boolean; separator: boolean };
type Match = Readonly<{ start: number; end: number }>;
type FoldedLine = Readonly<{ text: string; offsets: number[]; ends: number[] }>;

function invalid(error: string): ParsedAdvancedQuery {
  return { ok: false, error };
}

/**
 * Parse only literal tokens, quoted phrases, exclusions (-term) and OR.
 * There is intentionally no expression evaluation, user regex or recursion.
 */
export function parseAdvancedSourceQuery(query: string): ParsedAdvancedQuery {
  if (typeof query !== 'string' ||
      !isUtf8Text(query, MAX_ADVANCED_QUERY_BYTES)) {
    return invalid('Search must be valid Unicode text within 256 UTF-8 bytes.');
  }
  if (!query.trim()) return invalid('Enter at least one positive search term.');
  const tokens: Token[] = [];
  let index = 0;
  while (index < query.length) {
    while (index < query.length && /\s/u.test(query[index])) index++;
    if (index >= query.length) break;

    let excluded = false;
    if (query[index] === '-') {
      excluded = true;
      index++;
      if (index === query.length || /\s/u.test(query[index])) {
        return invalid('A minus sign must be followed by a term or quoted phrase.');
      }
    }

    let value = '';
    let quoted = false;
    if (query[index] === '"') {
      quoted = true;
      index++;
      let finished = false;
      while (index < query.length) {
        const character = query[index++];
        if (character === '"') {
          finished = true;
          break;
        }
        if (character === '\\') {
          if (index >= query.length) return invalid('Incomplete escape inside a quoted phrase.');
          const next = query[index++];
          if (next !== '"' && next !== '\\') {
            return invalid('Only escaped quotes and backslashes are supported in phrases.');
          }
          value += next;
        } else value += character;
      }
      if (!finished) return invalid('Close every quoted phrase with a double quote.');
      if (!value.trim()) return invalid('A quoted phrase cannot be empty.');
      if (index < query.length && !/\s/u.test(query[index])) {
        return invalid('Separate quoted phrases and search terms with spaces.');
      }
    } else {
      const start = index;
      while (index < query.length && !/\s/u.test(query[index])) index++;
      value = query.slice(start, index);
      if (!value || value.includes('"')) return invalid('Use quotes around multiword phrases.');
    }
    if (!value) return invalid('Search terms cannot be empty.');
    const separator = !quoted && !excluded && value.toUpperCase() === 'OR';
    tokens.push({ value, excluded, separator });
    if (tokens.length > MAX_ADVANCED_SEARCH_TERMS + MAX_ADVANCED_SEARCH_GROUPS - 1) {
      return invalid('The query exceeds the bounded term and clause count.');
    }
  }

  const clauses: SearchClause[] = [];
  let positive: SearchTerm[] = [];
  let negative: SearchTerm[] = [];
  let positives = 0;
  let exclusions = 0;
  for (const token of tokens) {
    if (token.separator) {
      if (!positive.length) return invalid('Every OR clause requires a positive search term.');
      clauses.push({ positive, negative });
      if (clauses.length >= MAX_ADVANCED_SEARCH_GROUPS) {
        return invalid('Use at most four alternative OR clauses.');
      }
      positive = [];
      negative = [];
      continue;
    }
    const term: SearchTerm = { text: token.value, excluded: token.excluded };
    if (token.excluded) {
      negative.push(term);
      exclusions++;
    } else {
      positive.push(term);
      positives++;
    }
  }
  if (!positive.length) return invalid('Every search clause requires a positive term.');
  clauses.push({ positive, negative });
  if (positives + exclusions > MAX_ADVANCED_SEARCH_TERMS) {
    return invalid('Use at most twelve included or excluded terms.');
  }
  return { ok: true, clauses, positives, exclusions };
}

function foldedLine(source: string): FoldedLine {
  let text = '';
  let offset = 0;
  const offsets: number[] = [];
  const ends: number[] = [];
  for (const scalar of source) {
    const lower = scalar.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      offsets.push(offset);
      ends.push(offset + scalar.length);
    }
    text += lower;
    offset += scalar.length;
  }
  return { text, offsets, ends };
}

function wordCharacter(scalar: string | undefined): boolean {
  return scalar !== undefined && /[\p{L}\p{M}\p{N}_]/u.test(scalar);
}

function wordBoundary(source: string, from: number, to: number): boolean {
  const before = from > 0 ? [...source.slice(0, from)].at(-1) : undefined;
  const after = to < source.length ? [...source.slice(to)][0] : undefined;
  return !wordCharacter(before) && !wordCharacter(after);
}

/**
 * Return non-overlapping, one-line UTF-16 source ranges.
 * Unicode folding is tracked back to original code-unit positions, so the
 * Monaco cursor never inherits an incorrect column from expanded lowercase.
 */
export function findAdvancedLiteral(
  source: string, term: string, caseSensitive: boolean,
  wholeWord: boolean, maxResults = MAX_ADVANCED_SOURCE_HITS + 1,
): Match[] {
  if (!term || maxResults <= 0) return [];
  const fold = caseSensitive ? null : foldedLine(source);
  const haystack = fold ? fold.text : source;
  const needle = caseSensitive ? term : term.toLowerCase();
  if (!needle) return [];
  const matches: Match[] = [];
  for (let from = 0; from < haystack.length;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    from = at + Math.max(1, needle.length);
    const start = fold ? fold.offsets[at] : at;
    const end = fold ? fold.ends[at + needle.length - 1] : at + needle.length;
    if (start === undefined || end === undefined || end <= start ||
        (wholeWord && !wordBoundary(source, start, end))) continue;
    // Overlapping Unicode folded matches can point to the same source range.
    if (matches.some(match => match.start === start && match.end === end)) continue;
    matches.push({ start, end });
    if (matches.length >= maxResults) break;
  }
  return matches;
}

function matchingClause(
  source: string, clause: SearchClause, caseSensitive: boolean, wholeWord: boolean,
): Match[] | null {
  const lead = findAdvancedLiteral(source, clause.positive[0].text, caseSensitive, wholeWord);
  if (!lead.length) return null;
  for (const term of clause.positive.slice(1)) {
    if (!findAdvancedLiteral(source, term.text, caseSensitive, wholeWord, 1).length) return null;
  }
  for (const term of clause.negative) {
    if (findAdvancedLiteral(source, term.text, caseSensitive, wholeWord, 1).length) return null;
  }
  return lead;
}

function safeCut(source: string, position: number, atStart: boolean): number {
  const before = source.charCodeAt(position - 1);
  const after = source.charCodeAt(position);
  const betweenSurrogates = position > 0 && position < source.length &&
    before >= 0xd800 && before <= 0xdbff &&
    after >= 0xdc00 && after <= 0xdfff;
  return betweenSurrogates ? position + (atStart ? -1 : 1) : position;
}

function preview(line: string, start: number, end: number):
  { value: string; truncated: boolean } {
  if (line.length <= MAX_ADVANCED_SOURCE_PREVIEW) return { value: line, truncated: false };
  const length = MAX_ADVANCED_SOURCE_PREVIEW;
  const offset = Math.min(Math.max(0, start - Math.floor(length / 3)), line.length - length);
  const from = safeCut(line, offset, true);
  const to = Math.min(line.length, safeCut(line, Math.min(line.length, offset + length), false));
  // A matching query can be longer than the preview limit. In that case the
  // snippet is still bounded; the actual match location remains exact.
  const value = (from ? '…' : '') + line.slice(from, to) +
    (to < line.length ? '…' : '');
  return { value, truncated: true };
}

/**
 * Local-only advanced search. Positive words must occur on the same line;
 * OR clauses are alternatives, and negative words exclude a whole line.
 */
export function advancedSourceSearch(
  workspace: Workspace, options: AdvancedSourceSearchOptions,
): AdvancedSourceSearchResult {
  const invalidWorkspace = validateWorkspace(workspace);
  if (invalidWorkspace) return { ok: false, error: invalidWorkspace };
  if (!options || typeof options.caseSensitive !== 'boolean' ||
      typeof options.wholeWord !== 'boolean' ||
      (options.path !== 'all' &&
        (!validPath(options.path) || !Object.hasOwn(workspace.files, options.path)))) {
    return { ok: false, error: 'Invalid local source search options.' };
  }
  const query = parseAdvancedSourceQuery(options.query);
  if (!query.ok) return { ok: false, error: query.error };

  const files = options.path === 'all' ? Object.keys(workspace.files).sort() : [options.path];
  const results: AdvancedSourceHit[] = [];
  const seen = new Set<string>();
  let scannedFiles = 0;
  let scannedLines = 0;
  let truncated = false;
  outer: for (const path of files) {
    scannedFiles++;
    const lines = workspace.files[path].split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
      scannedLines++;
      const line = lines[i];
      for (let clauseIndex = 0; clauseIndex < query.clauses.length; clauseIndex++) {
        const matches = matchingClause(
          line, query.clauses[clauseIndex], options.caseSensitive, options.wholeWord,
        );
        if (!matches) continue;
        for (const found of matches) {
          const key = JSON.stringify([path, i, found.start, found.end]);
          if (seen.has(key)) continue;
          seen.add(key);
          if (results.length >= MAX_ADVANCED_SOURCE_HITS) {
            truncated = true;
            break outer;
          }
          const snippet = preview(line, found.start, found.end);
          results.push({
            path, line: i + 1, column: found.start + 1,
            endColumn: found.end + 1, clause: clauseIndex + 1,
            preview: snippet.value, previewTruncated: snippet.truncated,
          });
        }
      }
    }
  }

  return {
    ok: true, hits: results, truncated, scannedFiles, scannedLines,
    alternatives: query.clauses.length,
  };
}
