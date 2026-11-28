import { validateWorkspace, type Workspace } from './workspace';

export const MAX_HYGIENE_ISSUES = 400;
export const MAX_HYGIENE_QUERY = 100;
export const RECOMMENDED_LINE_LENGTH = 140;

export type HygieneSeverity = 'security' | 'warning' | 'info';
export type HygieneRule =
  | 'bidi-control'
  | 'invisible-character'
  | 'control-character'
  | 'nonbreaking-space'
  | 'mixed-line-endings'
  | 'mixed-indentation'
  | 'trailing-whitespace'
  | 'missing-final-newline'
  | 'long-line';

export type HygieneIssue = Readonly<{
  path: string;
  line: number;
  column: number;
  rule: HygieneRule;
  severity: HygieneSeverity;
  message: string;
  fixable: boolean;
}>;

export type HygieneReport =
  | { ok: true; issues: HygieneIssue[]; truncated: boolean;
      counts: Record<HygieneSeverity, number>; fixable: number }
  | { ok: false; error: string };

export type HygienePlan =
  | { ok: true; workspace: Workspace; changedFiles: string[];
      trimmedLines: number; finalNewlines: number; normalizedFiles: number }
  | { ok: false; error: string };

type Line = Readonly<{ body: string; newline: '' | '\n' | '\r' | '\r\n'; number: number }>;
type LexicalState = 'code' | 'triple' | 'string' | 'raw';
type LineContext = Readonly<{ end: LexicalState; protectsTrailingSpace: boolean; containsTriple: boolean }>;
const ISSUE_LIMIT_ERROR = 'Workspace hygiene results exceed their browser display limit.';
const encoder = new TextEncoder();

/**
 * Split without losing line terminators. A line ending is part of a source
 * program: this parser never calls trim(), which would alter literal content.
 */
function splitLines(source: string): Line[] {
  const result: Line[] = [];
  let start = 0;
  let number = 1;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    if (code !== 10 && code !== 13) continue;
    const newline = code === 13 && source.charCodeAt(index + 1) === 10 ? '\r\n'
      : code === 13 ? '\r' : '\n';
    result.push({ body: source.slice(start, index), newline, number: number++ });
    if (newline.length === 2) index++;
    start = index + 1;
  }
  if (start < source.length || result.length === 0) {
    result.push({ body: source.slice(start), newline: '', number });
  }
  return result;
}

/**
 * Conservative textual state inspection only. The official Rust compiler
 * remains the authority for syntax and type errors. The purpose here is to
 * avoid altering trailing whitespace that may belong to a Scarp string.
 */
function contextOfLine(source: string, start: LexicalState): LineContext {
  let mode = start;
  let containsTriple = start === 'triple';
  let protectedSuffix = start !== 'code';
  let comment = false;
  for (let i = 0; i < source.length; i++) {
    if (mode === 'triple') {
      if (source.startsWith('"""', i)) {
        i += 2; mode = 'code'; protectedSuffix = false;
      }
      continue;
    }
    if (mode === 'raw') {
      if (source[i] === '"') { mode = 'code'; protectedSuffix = false; }
      continue;
    }
    if (mode === 'string') {
      if (source[i] === '\\') { i++; continue; }
      if (source[i] === '"') { mode = 'code'; protectedSuffix = false; }
      continue;
    }
    if (source.startsWith('//', i)) {
      comment = true;
      protectedSuffix = false;
      break;
    }
    if (source.startsWith('"""', i)) {
      mode = 'triple'; containsTriple = true; protectedSuffix = true; i += 2;
    } else if (source[i] === 'r' && source[i + 1] === '"' &&
        (i === 0 || !/[A-Za-z0-9_]/.test(source[i - 1]))) {
      mode = 'raw'; protectedSuffix = true; i++;
    } else if (source[i] === '"') {
      mode = 'string'; protectedSuffix = true;
    }
  }
  return {
    end: comment ? 'code' : mode,
    protectsTrailingSpace: protectedSuffix,
    containsTriple,
  };
}

function nextLineState(context: LineContext): LexicalState {
  // Only a triple quoted literal is expected to contain physical newlines.
  // For malformed ordinary strings, suppress fixes *on that line* and reset
  // for the next one rather than treating the rest of the file as a string.
  return context.end === 'triple' ? 'triple' : 'code';
}

function suspiciousCharacter(source: string, offset: number): Omit<HygieneIssue, 'path' | 'line' | 'column'> | null {
  const code = source.codePointAt(offset);
  if (code === undefined) return null;
  if ((code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      code === 0x061c || code === 0x200e || code === 0x200f) {
    return {
      rule: 'bidi-control', severity: 'security',
      message: 'Bidirectional text control can disguise source-code reading order.',
      fixable: false,
    };
  }
  if (code === 0x200b || code === 0x200c || code === 0x200d ||
      code === 0x2060 || code === 0xfeff || code === 0x180e) {
    return {
      rule: 'invisible-character', severity: 'warning',
      message: 'Invisible format character may be hard to distinguish in the editor.',
      fixable: false,
    };
  }
  if (code === 0x00a0 || code === 0x202f || code === 0x2007) {
    return {
      rule: 'nonbreaking-space', severity: 'warning',
      message: 'Nonbreaking space is visually similar to ordinary whitespace.',
      fixable: false,
    };
  }
  if (code < 0x20 && code !== 0x09 || code === 0x7f) {
    return {
      rule: 'control-character', severity: 'security',
      message: 'Unexpected control character in source text.',
      fixable: false,
    };
  }
  return null;
}

function scanFile(path: string, source: string, issue: (item: HygieneIssue) => void): void {
  const lines = splitLines(source);
  const endKinds = new Set<string>();
  let state: LexicalState = 'code';
  const containsTripleLiteral = source.includes('"""');
  let mixedEndingsReported = false;
  for (const line of lines) {
    if (line.newline !== '') {
      endKinds.add(line.newline);
      if (endKinds.size > 1 && !mixedEndingsReported) {
        issue({
          path, line: line.number, column: line.body.length + 1,
          rule: 'mixed-line-endings', severity: 'warning',
          message: 'The file mixes LF, CRLF or CR line endings.',
          fixable: !containsTripleLiteral,
        });
        mixedEndingsReported = true;
      }
    }
    const context = contextOfLine(line.body, state);
    const indent = line.body.match(/^[ \t]*/)?.[0] ?? '';
    if (state === 'code' && indent.includes(' ') && indent.includes('\t')) {
      issue({
        path, line: line.number, column: 1,
        rule: 'mixed-indentation', severity: 'info',
        message: 'Mixed tabs and spaces in indentation can render inconsistently.',
        fixable: false,
      });
    }
    if (line.body.length > RECOMMENDED_LINE_LENGTH) {
      issue({
        path, line: line.number, column: RECOMMENDED_LINE_LENGTH + 1,
        rule: 'long-line', severity: 'info',
        message: 'Line exceeds the recommended 140 UTF-16 code-unit display width.',
        fixable: false,
      });
    }
    for (let offset = 0; offset < line.body.length; offset++) {
      const warning = suspiciousCharacter(line.body, offset);
      if (warning) issue({ path, line: line.number, column: offset + 1, ...warning });
      if ((line.body.codePointAt(offset) ?? 0) > 0xffff) offset++;
    }
    const trailing = /[ \t]+$/.exec(line.body);
    if (trailing && !context.protectsTrailingSpace) {
      issue({
        path, line: line.number, column: trailing.index + 1,
        rule: 'trailing-whitespace', severity: 'info',
        message: 'Whitespace after the final non-whitespace character.',
        fixable: true,
      });
    }
    state = nextLineState(context);
  }
  if (source && !/[\r\n]$/.test(source) && state !== 'triple') {
    const last = lines.at(-1)!;
    issue({
      path, line: last.number, column: last.body.length + 1,
      rule: 'missing-final-newline', severity: 'info',
      message: 'Source file does not end with a newline.',
      fixable: true,
    });
  }
}

/** Scan known, bounded source files; no compiler run, network, or persistence. */
export function analyzeSourceHygiene(workspace: Workspace): HygieneReport {
  const problem = validateWorkspace(workspace);
  if (problem) return { ok: false, error: problem };
  const issues: HygieneIssue[] = [];
  const counts: Record<HygieneSeverity, number> = { security: 0, warning: 0, info: 0 };
  let truncated = false;
  let fixable = 0;
  const append = (item: HygieneIssue) => {
    if (issues.length >= MAX_HYGIENE_ISSUES) { truncated = true; return; }
    issues.push(item);
    counts[item.severity]++;
    if (item.fixable) fixable++;
  };
  for (const path of Object.keys(workspace.files).sort()) {
    scanFile(path, workspace.files[path], append);
  }
  return { ok: true, issues, counts, fixable, truncated };
}

function normalizeEndings(lines: readonly Line[]): string {
  return lines.map(line => line.body + (line.newline ? '\n' : '')).join('');
}

/**
 * Apply only conservative, text-only style fixes after an explicit preview.
 * Never erase suspicious Unicode; those characters require a human review.
 * Never normalize newlines in files with triple-quoted strings, as they can
 * be part of a literal's runtime value.
 */
export function planSourceHygieneCleanup(workspace: Workspace): HygienePlan {
  const report = analyzeSourceHygiene(workspace);
  if (!report.ok) return report;
  if (report.truncated) return { ok: false, error: ISSUE_LIMIT_ERROR };
  const files: Record<string, string> = { ...workspace.files };
  const changedFiles: string[] = [];
  let trimmedLines = 0;
  let finalNewlines = 0;
  let normalizedFiles = 0;
  for (const path of Object.keys(files).sort()) {
    const original = files[path];
    const lines = splitLines(original);
    let state: LexicalState = 'code';
    let containsTriple = false;
    let trimmed = 0;
    const changed = lines.map(line => {
      const context = contextOfLine(line.body, state);
      containsTriple ||= context.containsTriple;
      state = nextLineState(context);
      const trailing = context.protectsTrailingSpace ? line.body : line.body.replace(/[ \t]+$/, '');
      if (trailing !== line.body) trimmed++;
      return { ...line, body: trailing };
    });
    const endings = new Set(changed.map(line => line.newline).filter(Boolean));
    let rewritten = containsTriple || endings.size <= 1
      ? changed.map(line => line.body + line.newline).join('')
      : normalizeEndings(changed);
    if (!containsTriple && endings.size > 1) normalizedFiles++;
    if (rewritten && !/[\r\n]$/.test(rewritten) && state !== 'triple') {
      const dominant = original.includes('\r\n') && endings.size === 1 ? '\r\n' : '\n';
      rewritten += dominant;
      finalNewlines++;
    }
    if (rewritten !== original) {
      files[path] = rewritten;
      changedFiles.push(path);
      trimmedLines += trimmed;
    }
  }
  if (changedFiles.length === 0) return { ok: false, error: 'No safely fixable source hygiene findings.' };
  const planned = { entry: workspace.entry, files };
  const problem = validateWorkspace(planned);
  if (problem) return { ok: false, error: problem };
  // Keep the original workspace untouched even if the replacement is rejected.
  if (Object.keys(files).length !== Object.keys(workspace.files).length) {
    return { ok: false, error: 'A source hygiene cleanup cannot add or remove files.' };
  }
  // Rechecked, bounded byte count; no source is copied to storage or URLs here.
  const totalBytes = Object.values(files).reduce((sum, value) => sum + encoder.encode(value).byteLength, 0);
  if (totalBytes > 128 * 1024) return { ok: false, error: 'Cleaned project exceeds the workspace size limit.' };
  return { ok: true, workspace: planned, changedFiles, trimmedLines, finalNewlines, normalizedFiles };
}

/** Filtering is UI-only and never re-runs source modification. */
export function filterSourceHygiene(
  issues: readonly HygieneIssue[], query: string, severity: HygieneSeverity | 'all' = 'all',
): HygieneIssue[] {
  if (query.length > MAX_HYGIENE_QUERY) return [];
  const needle = query.toLocaleLowerCase();
  return issues.filter(issue =>
    (severity === 'all' || issue.severity === severity) &&
    (needle === '' || (issue.path + ' ' + issue.rule + ' ' + issue.message)
      .toLocaleLowerCase().includes(needle)));
}
