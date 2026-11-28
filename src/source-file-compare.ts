import { validateWorkspace, validPath, type Workspace } from './workspace';

export const MAX_COMPARE_MATRIX_CELLS = 1_400_000;
export const MAX_COMPARE_LINES = 5000;
export const MAX_COMPARE_DISPLAY_ROWS = 260;
export const MAX_COMPARE_DISPLAY_HUNKS = 80;
export const MAX_COMPARE_CONTEXT = 5;
export const MAX_COMPARE_TEXT_BYTES = 32 * 1024;

export type FileComparisonOptions = Readonly<{
  left: string;
  right: string;
  ignoreLineEndings: boolean;
  ignoreTrailingWhitespace: boolean;
  context: number;
}>;

export type FileComparisonRow = Readonly<{
  kind: 'same' | 'added' | 'removed' | 'changed';
  leftLine: number | null;
  rightLine: number | null;
  leftText: string | null;
  rightText: string | null;
}>;

export type FileComparisonHunk = Readonly<{
  leftStart: number;
  rightStart: number;
  leftCount: number;
  rightCount: number;
  rows: FileComparisonRow[];
}>;

export type FileComparison =
  | { ok: true; left: string; right: string;
      rows: number; matching: number; added: number; removed: number; changed: number;
      leftLines: number; rightLines: number;
      hunks: FileComparisonHunk[]; truncated: boolean;
      options: FileComparisonOptions; identical: boolean }
  | { ok: false; error: string };

export type FileCompareLine = Readonly<{
  body: string; newline: '' | '\n' | '\r' | '\r\n';
  number: number; start: number;
}>;

function invalid(error: string): FileComparison { return { ok: false, error }; }

/**
 * Split without normalizing CRLF/LF/CR or discarding trailing empty lines.
 * The result remains local, bounded and independent of the compiler AST.
 */
export function splitCompareLines(source: string): FileCompareLine[] {
  const result: FileCompareLine[] = [];
  let start = 0;
  let line = 1;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char !== '\r' && char !== '\n') continue;
    const newline = char === '\r' && source[index + 1] === '\n' ? '\r\n'
      : char === '\r' ? '\r' : '\n';
    result.push({ body: source.slice(start, index), newline, start, number: line++ });
    if (newline === '\r\n') index++;
    start = index + 1;
  }
  result.push({ body: source.slice(start), newline: '', start, number: line });
  return result;
}

function keyOf(line: FileCompareLine, options: FileComparisonOptions): string {
  const body = options.ignoreTrailingWhitespace
    ? line.body.replace(/[ \t]+$/, '') : line.body;
  return options.ignoreLineEndings ? body : body + '\u0000' + line.newline;
}

function validOptions(workspace: Workspace, options: unknown):
  options is FileComparisonOptions {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return false;
  const values = options as Record<string, unknown>;
  return validPath(values.left) && validPath(values.right) &&
    values.left !== values.right &&
    Object.hasOwn(workspace.files, values.left) &&
    Object.hasOwn(workspace.files, values.right) &&
    typeof values.ignoreLineEndings === 'boolean' &&
    typeof values.ignoreTrailingWhitespace === 'boolean' &&
    Number.isInteger(values.context) && Number(values.context) >= 0 &&
    Number(values.context) <= MAX_COMPARE_CONTEXT;
}

type RawOperation = Readonly<{
  kind: 'same' | 'added' | 'removed';
  left: FileCompareLine | null;
  right: FileCompareLine | null;
}>;

/**
 * Bounded dynamic-programming LCS. A 16-bit matrix is sufficient because
 * each source is limited to 5000 logical lines. Reject pathological input
 * before allocating potentially quadratic memory.
 */
function diffRaw(
  left: readonly FileCompareLine[], right: readonly FileCompareLine[],
  options: FileComparisonOptions,
): RawOperation[] {
  const countLeft = left.length, countRight = right.length;
  const width = countRight + 1;
  const matrix = new Uint16Array((countLeft + 1) * width);
  const a = left.map(line => keyOf(line, options));
  const b = right.map(line => keyOf(line, options));

  for (let i = countLeft - 1; i >= 0; i--) {
    for (let j = countRight - 1; j >= 0; j--) {
      const index = i * width + j;
      matrix[index] = a[i] === b[j]
        ? matrix[(i + 1) * width + j + 1] + 1
        : Math.max(matrix[(i + 1) * width + j], matrix[index + 1]);
    }
  }

  const operations: RawOperation[] = [];
  let i = 0, j = 0;
  while (i < countLeft || j < countRight) {
    if (i < countLeft && j < countRight && a[i] === b[j]) {
      operations.push({ kind: 'same', left: left[i++], right: right[j++] });
      continue;
    }
    const removalWins = i < countLeft &&
      (j === countRight || matrix[(i + 1) * width + j] >= matrix[i * width + j + 1]);
    if (removalWins) {
      operations.push({ kind: 'removed', left: left[i++], right: null });
    } else {
      operations.push({ kind: 'added', left: null, right: right[j++] });
    }
  }
  return operations;
}

function shape(
  kind: FileComparisonRow['kind'],
  left: FileCompareLine | null,
  right: FileCompareLine | null,
): FileComparisonRow {
  return {
    kind, leftLine: left?.number ?? null, rightLine: right?.number ?? null,
    leftText: left?.body ?? null, rightText: right?.body ?? null,
  };
}

/** Pair adjacent removed/added blocks as changed lines for readability. */
function groupedRows(operations: readonly RawOperation[]): FileComparisonRow[] {
  const result: FileComparisonRow[] = [];
  for (let index = 0; index < operations.length;) {
    if (operations[index].kind === 'same') {
      const item = operations[index++];
      result.push(shape('same', item.left, item.right));
      continue;
    }
    const removed: FileCompareLine[] = [];
    const added: FileCompareLine[] = [];
    while (index < operations.length && operations[index].kind !== 'same') {
      const item = operations[index++];
      if (item.kind === 'removed' && item.left) removed.push(item.left);
      if (item.kind === 'added' && item.right) added.push(item.right);
    }
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k++) result.push(shape('changed', removed[k], added[k]));
    for (let k = pairs; k < removed.length; k++) result.push(shape('removed', removed[k], null));
    for (let k = pairs; k < added.length; k++) result.push(shape('added', null, added[k]));
  }
  return result;
}

function buildHunks(
  rows: readonly FileComparisonRow[], context: number,
): { hunks: FileComparisonHunk[]; truncated: boolean } {
  const changes: number[] = [];
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].kind !== 'same') changes.push(index);
  }
  if (!changes.length) return { hunks: [], truncated: false };

  const windows: Array<{ from: number; to: number }> = [];
  for (const changed of changes) {
    const from = Math.max(0, changed - context);
    const to = Math.min(rows.length, changed + context + 1);
    const last = windows.at(-1);
    if (last && from <= last.to) last.to = Math.max(last.to, to);
    else windows.push({ from, to });
  }

  const hunks: FileComparisonHunk[] = [];
  let displayed = 0;
  let truncated = false;
  for (const window of windows) {
    if (hunks.length >= MAX_COMPARE_DISPLAY_HUNKS ||
        displayed >= MAX_COMPARE_DISPLAY_ROWS) {
      truncated = true;
      break;
    }
    const windowRows = rows.slice(window.from,
      Math.min(window.to, window.from + MAX_COMPARE_DISPLAY_ROWS - displayed));
    // Start coordinates must count *their own* source side, even when a
    // hunk starts with an insertion/deletion that has no opposite line.
    const before = rows.slice(0, window.from);
    const leftStart = 1 + before.filter(row => row.leftLine !== null).length;
    const rightStart = 1 + before.filter(row => row.rightLine !== null).length;
    const leftCount = windowRows.filter(row => row.leftLine !== null).length;
    const rightCount = windowRows.filter(row => row.rightLine !== null).length;
    hunks.push({ leftStart, rightStart, leftCount, rightCount, rows: windowRows });
    displayed += windowRows.length;
    if (window.from + windowRows.length < window.to) {
      truncated = true;
      break;
    }
  }
  return { hunks, truncated };
}

/**
 * Show exact source-line differences between two existing virtual files.
 * It is not a syntax-aware compiler diff and never modifies a source file.
 */
export function compareWorkspaceFiles(
  workspace: Workspace, options: FileComparisonOptions,
): FileComparison {
  const problem = validateWorkspace(workspace);
  if (problem) return invalid(problem);
  if (!validOptions(workspace, options)) {
    return invalid('Choose two distinct local Scarp files and valid diff options.');
  }
  const left = splitCompareLines(workspace.files[options.left]);
  const right = splitCompareLines(workspace.files[options.right]);
  if (left.length > MAX_COMPARE_LINES || right.length > MAX_COMPARE_LINES) {
    return invalid('Too many source lines to compare safely in the browser.');
  }
  const cells = (left.length + 1) * (right.length + 1);
  if (cells > MAX_COMPARE_MATRIX_CELLS) {
    return invalid('The comparison is too large for the bounded diff matrix.');
  }
  const allRows = groupedRows(diffRaw(left, right, options));
  let matching = 0, added = 0, removed = 0, changed = 0;
  for (const row of allRows) {
    switch (row.kind) {
      case 'same': matching++; break;
      case 'added': added++; break;
      case 'removed': removed++; break;
      case 'changed': changed++; break;
    }
  }
  const { hunks, truncated } = buildHunks(allRows, options.context);
  return {
    ok: true, left: options.left, right: options.right,
    rows: allRows.length, leftLines: left.length, rightLines: right.length,
    matching, added, removed, changed, hunks, truncated,
    identical: added === 0 && removed === 0 && changed === 0,
    options: { ...options },
  };
}

/** Human-readable unified-style excerpt, not a patch apply format. */
export function textFileComparison(report: FileComparison): string | null {
  if (!report.ok) return null;
  const header = [
    'Scarp source file comparison',
    'Left: ' + report.left, 'Right: ' + report.right,
    'Unchanged: ' + report.matching + ', added: ' + report.added +
      ', removed: ' + report.removed + ', changed: ' + report.changed,
    'Options: ignore endings=' + report.options.ignoreLineEndings +
      ', ignore trailing whitespace=' + report.options.ignoreTrailingWhitespace,
  ];
  const lines = [...header];
  const encoder = new TextEncoder();
  let consumed = encoder.encode(lines.join('\n')).byteLength;
  const add = (line: string): boolean => {
    const size = encoder.encode(line).byteLength + 1;
    if (consumed + size > MAX_COMPARE_TEXT_BYTES) return false;
    consumed += size;
    lines.push(line);
    return true;
  };
  let stopped = false;
  for (const hunk of report.hunks) {
    if (!add('@@ -' + hunk.leftStart + ',' + hunk.leftCount +
      ' +' + hunk.rightStart + ',' + hunk.rightCount + ' @@')) { stopped = true; break; }
    for (const row of hunk.rows) {
      const before = row.leftText ?? '';
      const after = row.rightText ?? '';
      if (row.kind === 'same' && !add(' ' + before) ||
          row.kind === 'removed' && !add('-' + before) ||
          row.kind === 'added' && !add('+' + after) ||
          row.kind === 'changed' && (!add('-' + before) || !add('+' + after))) {
        stopped = true;
        break;
      }
    }
    if (stopped) break;
  }
  if (stopped || report.truncated) {
    const marker = '… comparison excerpt is truncated …';
    while (lines.length > header.length &&
        consumed + encoder.encode(marker).byteLength + 1 > MAX_COMPARE_TEXT_BYTES) {
      const previous = lines.pop()!;
      consumed -= encoder.encode(previous).byteLength + 1;
    }
    add(marker);
  }
  return lines.join('\n');
}
