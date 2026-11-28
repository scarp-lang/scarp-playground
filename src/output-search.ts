import { isUtf8Text } from './utf8';
import { MAX_OUTPUT_BYTES } from './runner/protocol';

export const MAX_OUTPUT_SEARCH_QUERY_BYTES = 120;
export const MAX_OUTPUT_SEARCH_RESULTS = 160;
export const MAX_OUTPUT_SEARCH_LINES = 20_000;
export const MAX_OUTPUT_SEARCH_SNIPPET = 160;

export type OutputSearchStream = 'stdout' | 'stderr';
export type OutputSearchOptions = Readonly<{
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  includeStdout: boolean;
  includeStderr: boolean;
}>;

export type OutputSearchHit = Readonly<{
  stream: OutputSearchStream;
  line: number;
  column: number;
  endColumn: number;
  before: string;
  match: string;
  after: string;
  omittedBefore: boolean;
  omittedAfter: boolean;
}>;

export type OutputSearchReport =
  | { ok: true; hits: OutputSearchHit[];
      processedLines: number;
      truncated: boolean;
      reason: 'matches' | 'lines' | null;
      streamsSearched: number }
  | { ok: false; error: string };

type Match = Readonly<{ start: number; end: number }>;
type Fold = { content: string; starts: number[]; ends: number[] };

function fold(source: string): Fold {
  let content = '';
  const starts: number[] = [], ends: number[] = [];
  let offset = 0;
  for (const scalar of source) {
    const lower = scalar.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      starts.push(offset);
      ends.push(offset + scalar.length);
    }
    content += lower;
    offset += scalar.length;
  }
  return { content, starts, ends };
}

function wordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{M}\p{N}_]/u.test(character);
}

function wholeWord(source: string, start: number, end: number): boolean {
  const before = start ? [...source.slice(0, start)].at(-1) : undefined;
  const after = end < source.length ? [...source.slice(end)][0] : undefined;
  return !wordCharacter(before) && !wordCharacter(after);
}

/**
 * Literal line search that maps Unicode case-fold expansions to UTF-16
 * offsets in the *original* output. No user-provided regular expressions.
 */
export function searchOutputLine(
  line: string, query: string, caseSensitive: boolean,
  requireWholeWord: boolean, limit: number,
): Match[] {
  if (!query || limit < 1) return [];
  const mapping = caseSensitive ? null : fold(line);
  const haystack = mapping ? mapping.content : line;
  const needle = caseSensitive ? query : query.toLowerCase();
  if (!needle) return [];
  const matches: Match[] = [];
  for (let from = 0; from < haystack.length;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    from = at + Math.max(1, needle.length);
    const start = mapping ? mapping.starts[at] : at;
    const end = mapping ? mapping.ends[at + needle.length - 1] : at + needle.length;
    if (start === undefined || end === undefined || end <= start ||
        (requireWholeWord && !wholeWord(line, start, end))) continue;
    if (matches.some(item => item.start === start && item.end === end)) continue;
    matches.push({ start, end });
    if (matches.length >= limit) break;
  }
  return matches;
}

function safeBoundary(text: string, offset: number, left: boolean): number {
  if (offset <= 0 || offset >= text.length) return offset;
  const previous = text.charCodeAt(offset - 1);
  const following = text.charCodeAt(offset);
  const betweenPair = previous >= 0xd800 && previous <= 0xdbff &&
    following >= 0xdc00 && following <= 0xdfff;
  return betweenPair ? offset + (left ? -1 : 1) : offset;
}

function snippet(line: string, match: Match): Pick<OutputSearchHit,
  'before' | 'match' | 'after' | 'omittedBefore' | 'omittedAfter'> {
  const limit = MAX_OUTPUT_SEARCH_SNIPPET;
  const from = safeBoundary(line, Math.max(0, match.start - Math.floor(limit / 3)), true);
  const targetEnd = Math.min(line.length, Math.max(match.end, from + limit));
  const end = safeBoundary(line, targetEnd, false);
  const to = Math.min(end, from + limit + 1);
  const safeTo = safeBoundary(line, to, true);
  const matchEnd = Math.min(match.end, safeTo);
  return {
    before: line.slice(from, match.start),
    match: line.slice(match.start, matchEnd),
    after: line.slice(matchEnd, safeTo),
    omittedBefore: from > 0,
    omittedAfter: safeTo < line.length,
  };
}

/**
 * Stream without allocating a potentially million-element array for output
 * that consists entirely of line breaks. Stop after fixed line or hit caps.
 */
function scanStream(
  source: string, stream: OutputSearchStream,
  query: string, options: OutputSearchOptions,
  report: { hits: OutputSearchHit[]; lines: number;
    truncated: boolean; reason: 'matches' | 'lines' | null },
): void {
  let position = 0;
  let lineNumber = 1;
  while (position <= source.length) {
    if (report.lines >= MAX_OUTPUT_SEARCH_LINES) {
      report.truncated = true;
      report.reason = 'lines';
      return;
    }
    let end = position;
    while (end < source.length && source[end] !== '\n' && source[end] !== '\r') end++;
    const line = source.slice(position, end);
    report.lines++;
    const matches = searchOutputLine(
      line, query, options.caseSensitive, options.wholeWord,
      MAX_OUTPUT_SEARCH_RESULTS + 1,
    );
    for (const match of matches) {
      if (report.hits.length >= MAX_OUTPUT_SEARCH_RESULTS) {
        report.truncated = true;
        report.reason = 'matches';
        return;
      }
      report.hits.push({
        stream, line: lineNumber, column: match.start + 1,
        endColumn: match.end + 1, ...snippet(line, match),
      });
    }
    if (end === source.length) return;
    position = end + (source[end] === '\r' && source[end + 1] === '\n' ? 2 : 1);
    lineNumber++;
  }
}

/**
 * Search already-captured successful Run output only. The scanner neither
 * executes a program nor stores/exposes a new persistent copy of output.
 */
export function searchProgramOutput(
  stdout: unknown, stderr: unknown, options: OutputSearchOptions,
): OutputSearchReport {
  if (typeof stdout !== 'string' || typeof stderr !== 'string' ||
      !isUtf8Text(stdout, MAX_OUTPUT_BYTES) ||
      !isUtf8Text(stderr, MAX_OUTPUT_BYTES) ||
      new TextEncoder().encode(stdout).byteLength +
        new TextEncoder().encode(stderr).byteLength > MAX_OUTPUT_BYTES) {
    return { ok: false, error: 'Output is malformed or exceeds the compiler output budget.' };
  }
  if (!options || typeof options.query !== 'string' ||
      !isUtf8Text(options.query, MAX_OUTPUT_SEARCH_QUERY_BYTES) ||
      !options.query || /[\r\n]/.test(options.query)) {
    return { ok: false, error: 'Enter a single-line UTF-8 search term within 120 bytes.' };
  }
  if (typeof options.caseSensitive !== 'boolean' ||
      typeof options.wholeWord !== 'boolean' ||
      typeof options.includeStdout !== 'boolean' ||
      typeof options.includeStderr !== 'boolean' ||
      (!options.includeStdout && !options.includeStderr)) {
    return { ok: false, error: 'Choose at least one output stream and valid search options.' };
  }
  const report: { hits: OutputSearchHit[]; lines: number;
    truncated: boolean; reason: 'matches' | 'lines' | null } = {
    hits: [], lines: 0, truncated: false, reason: null,
  };
  const streams: Array<{ source: string; label: OutputSearchStream }> = [];
  if (options.includeStdout) streams.push({ source: stdout, label: 'stdout' });
  if (options.includeStderr) streams.push({ source: stderr, label: 'stderr' });
  for (const { source, label } of streams) {
    if (!source) continue;
    scanStream(source, label, options.query, options, report);
    if (report.truncated) break;
  }
  return {
    ok: true, hits: report.hits, processedLines: report.lines,
    truncated: report.truncated, reason: report.reason,
    streamsSearched: streams.length,
  };
}
