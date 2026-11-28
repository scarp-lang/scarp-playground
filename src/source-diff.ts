import { MAX_FILE_BYTES } from './workspace';

export const MAX_DIFF_ROWS = 240;
export const MAX_DIFF_LINE_CHARS = 320;
export const MAX_DIFF_MATRIX_CELLS = 65_536;
const CONTEXT_LINES = 3;

type Line = { text: string; ending: 'LF' | 'CRLF' | 'CR' | 'EOF' };
export type DiffRow = {
  kind: 'context' | 'removed' | 'added';
  before: number | null;
  after: number | null;
  text: string;
  ending: Line['ending'];
  truncated: boolean;
};

export type SourceDiff = {
  rows: DiffRow[];
  omitted: number;
  approximate: boolean;
  error: string | null;
};

function lines(source: string): Line[] {
  const result: Line[] = [];
  let start = 0;
  for (let cursor = 0; cursor < source.length; cursor++) {
    const char = source[cursor];
    if (char !== '\r' && char !== '\n') continue;
    const text = source.slice(start, cursor);
    const ending = char === '\n' ? 'LF' : source[cursor + 1] === '\n' ? 'CRLF' : 'CR';
    if (ending === 'CRLF') cursor++;
    result.push({ text, ending });
    start = cursor + 1;
  }
  if (start < source.length) result.push({ text: source.slice(start), ending: 'EOF' });
  return result;
}

const equal = (a: Line, b: Line): boolean => a.text === b.text && a.ending === b.ending;

function preview(line: Line): Pick<DiffRow, 'text' | 'ending' | 'truncated'> {
  let end = Math.min(MAX_DIFF_LINE_CHARS, line.text.length);
  const truncated = end < line.text.length;
  if (truncated && line.text.charCodeAt(end - 1) >= 0xd800 &&
      line.text.charCodeAt(end - 1) <= 0xdbff) end--;
  return { text: line.text.slice(0, end), ending: line.ending, truncated };
}

/**
 * Bounded line comparison. Trim common prefix/suffix, then use a small LCS
 * matrix only when affordable. Large changed regions fall back to a clearly
 * labelled removal/addition preview. Line endings participate in equality.
 * Never apply this display as a patch; restoration uses exact source bytes.
 */
export function diffSource(before: string | null, after: string | null): SourceDiff {
  const encoder = new TextEncoder();
  if ([before, after].some(source => source !== null &&
      (typeof source !== 'string' || source.length > MAX_FILE_BYTES ||
        encoder.encode(source).byteLength > MAX_FILE_BYTES))) {
    return { rows: [], omitted: 0, approximate: false, error: 'Source exceeds the diff preview limit.' };
  }
  if (before === after) return { rows: [], omitted: 0, approximate: false, error: null };
  const left = lines(before ?? '');
  const right = lines(after ?? '');
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && equal(left[prefix], right[prefix])) prefix++;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix &&
      equal(left[left.length - 1 - suffix], right[right.length - 1 - suffix])) suffix++;

  const rows: DiffRow[] = [];
  let omitted = Math.max(0, prefix - CONTEXT_LINES) + Math.max(0, suffix - CONTEXT_LINES);
  function emit(kind: DiffRow['kind'], line: Line, oldIndex: number | null, newIndex: number | null) {
    if (rows.length >= MAX_DIFF_ROWS) { omitted++; return; }
    rows.push({ kind, before: oldIndex === null ? null : oldIndex + 1,
      after: newIndex === null ? null : newIndex + 1, ...preview(line) });
  }

  for (let i = Math.max(0, prefix - CONTEXT_LINES); i < prefix; i++) emit('context', left[i], i, i);
  const n = left.length - prefix - suffix;
  const m = right.length - prefix - suffix;
  const approximate = n > 0 && m > 0 && (n + 1) * (m + 1) > MAX_DIFF_MATRIX_CELLS;
  if (approximate || n === 0 || m === 0) {
    for (let i = 0; i < n; i++) emit('removed', left[prefix + i], prefix + i, null);
    for (let j = 0; j < m; j++) emit('added', right[prefix + j], null, prefix + j);
  } else {
    const stride = m + 1;
    const matrix = new Uint16Array((n + 1) * stride);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const at = i * stride + j;
        matrix[at] = equal(left[prefix + i], right[prefix + j]) ?
          matrix[at + stride + 1] + 1 : Math.max(matrix[at + stride], matrix[at + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && equal(left[prefix + i], right[prefix + j])) {
        emit('context', left[prefix + i], prefix + i, prefix + j);
        i++; j++;
      } else if (i < n && (j === m || matrix[(i + 1) * stride + j] >= matrix[i * stride + j + 1])) {
        emit('removed', left[prefix + i], prefix + i, null);
        i++;
      } else {
        emit('added', right[prefix + j], null, prefix + j);
        j++;
      }
    }
  }
  for (let i = 0; i < Math.min(suffix, CONTEXT_LINES); i++) {
    const oldIndex = left.length - suffix + i;
    const newIndex = right.length - suffix + i;
    emit('context', left[oldIndex], oldIndex, newIndex);
  }
  return { rows, omitted, approximate, error: null };
}
