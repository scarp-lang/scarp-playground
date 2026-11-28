import { validateWorkspace, validPath, type Workspace } from './workspace';

export const MAX_SOURCE_TASKS = 160;
export const MAX_SOURCE_TASK_SUMMARY = 180;
export const MAX_SOURCE_TASK_QUERY = 96;
export const SOURCE_TASK_TAGS = ['TODO', 'FIXME', 'HACK', 'XXX', 'OPTIMIZE', 'NOTE'] as const;

export type SourceTaskTag = typeof SOURCE_TASK_TAGS[number];
export type SourceTaskPriority = 'urgent' | 'normal' | 'informational';
export type SourceTask = Readonly<{
  id: string;
  path: string;
  line: number;
  column: number;
  tag: SourceTaskTag;
  priority: SourceTaskPriority;
  summary: string;
  previewTruncated: boolean;
}>;

export type SourceTaskScan =
  | { ok: true; tasks: SourceTask[]; truncated: boolean; scannedFiles: number;
      counts: Record<SourceTaskTag, number> }
  | { ok: false; error: string };

export type SourceTaskFilter = Readonly<{
  tag: SourceTaskTag | 'all';
  priority: SourceTaskPriority | 'all';
  path: string | 'all';
  review: 'all' | 'reviewed' | 'pending';
  query: string;
}>;

export const DEFAULT_SOURCE_TASK_FILTER: SourceTaskFilter = {
  tag: 'all', priority: 'all', path: 'all', review: 'all', query: '',
};

type LexicalState = 'code' | 'quoted' | 'raw' | 'multiline';
const TASK_PREFIX = /^\s*(TODO|FIXME|HACK|XXX|OPTIMIZE|NOTE)(?=\s|:|-|$)(?:\s*[:-]\s*|\s+|$)/i;

function priorityOf(tag: SourceTaskTag): SourceTaskPriority {
  if (tag === 'FIXME' || tag === 'XXX') return 'urgent';
  if (tag === 'NOTE') return 'informational';
  return 'normal';
}

function shorten(text: string): { value: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_SOURCE_TASK_SUMMARY) {
    return { value: trimmed || '(no description)', truncated: false };
  }
  const candidate = trimmed.slice(0, MAX_SOURCE_TASK_SUMMARY);
  const last = candidate.charCodeAt(candidate.length - 1);
  const safe = last >= 0xd800 && last <= 0xdbff ? candidate.slice(0, -1) : candidate;
  return { value: safe + '…', truncated: true };
}

function taskId(path: string, line: number, column: number, tag: SourceTaskTag, text: string): string {
  // Including the content prevents old review acknowledgements from silently
  // applying to a newly edited task at the same line and column.
  return JSON.stringify([path, line, column, tag, text]);
}

function parseTask(
  path: string, line: number, commentColumn: number, comment: string,
): SourceTask | null {
  const slashes = /^\/+/.exec(comment)?.[0].length ?? 0;
  const contents = comment.slice(slashes);
  const prefix = TASK_PREFIX.exec(contents);
  if (!prefix) return null;
  const tag = prefix[1].toUpperCase() as SourceTaskTag;
  const leadingWhitespace = /^\s*/.exec(contents)?.[0].length ?? 0;
  const column = commentColumn + 2 + slashes + leadingWhitespace;
  const body = shorten(contents.slice(prefix[0].length));
  return {
    id: taskId(path, line, column, tag, comment),
    path, line, column, tag, priority: priorityOf(tag),
    summary: body.value, previewTruncated: body.truncated,
  };
}

/**
 * A bounded lexical scan that recognizes only //-style comments outside
 * regular, raw, and triple-quoted Scarp strings.
 *
 * This is an advisory text utility, not the compiler lexer or a parser.
 * It never executes source code or reads anything outside the virtual files.
 */
function scanFile(path: string, source: string, add: (task: SourceTask) => boolean): boolean {
  let state: LexicalState = 'code';
  let index = 0;
  let line = 1;
  let column = 1;

  const step = (): void => {
    const character = source[index];
    if (character === '\r') {
      index += source[index + 1] === '\n' ? 2 : 1;
      line++;
      column = 1;
      if (state !== 'multiline') state = 'code';
    } else if (character === '\n') {
      index++;
      line++;
      column = 1;
      if (state !== 'multiline') state = 'code';
    } else {
      index++;
      column++;
    }
  };

  while (index < source.length) {
    if (state === 'multiline') {
      if (source.startsWith('"""', index)) {
        for (let count = 0; count < 3; count++) step();
        state = 'code';
      } else step();
      continue;
    }
    const character = source[index];
    if (character === '\r' || character === '\n') {
      step();
      continue;
    }
    if (state === 'quoted') {
      if (character === '\\' && index + 1 < source.length &&
          source[index + 1] !== '\r' && source[index + 1] !== '\n') {
        step();
        step();
      } else if (character === '"') {
        step();
        state = 'code';
      } else step();
      continue;
    }
    if (state === 'raw') {
      if (character === '"') state = 'code';
      step();
      continue;
    }

    if (source.startsWith('//', index)) {
      const first = index + 2;
      let end = first;
      while (end < source.length && source[end] !== '\r' && source[end] !== '\n') end++;
      const comment = source.slice(first, end);
      const task = parseTask(path, line, column, comment);
      if (task && !add(task)) return false;
      while (index < end) step();
      continue;
    }
    if (source.startsWith('"""', index)) {
      state = 'multiline';
      step(); step(); step();
      continue;
    }
    if (source.startsWith('r"', index) &&
        (index === 0 || !/[A-Za-z0-9_]/.test(source[index - 1]))) {
      state = 'raw';
      step(); step();
      continue;
    }
    if (character === '"') {
      state = 'quoted';
      step();
      continue;
    }
    step();
  }
  return true;
}

export function scanSourceTasks(workspace: Workspace): SourceTaskScan {
  const problem = validateWorkspace(workspace);
  if (problem) return { ok: false, error: problem };
  const tasks: SourceTask[] = [];
  const counts: Record<SourceTaskTag, number> = {
    TODO: 0, FIXME: 0, HACK: 0, XXX: 0, OPTIMIZE: 0, NOTE: 0,
  };
  const paths = Object.keys(workspace.files).filter(validPath).sort();
  let truncated = false;
  let scannedFiles = 0;

  for (const path of paths) {
    scannedFiles++;
    const complete = scanFile(path, workspace.files[path], task => {
      if (tasks.length >= MAX_SOURCE_TASKS) {
        truncated = true;
        return false;
      }
      tasks.push(task);
      counts[task.tag]++;
      return true;
    });
    if (!complete) break;
  }
  return { ok: true, tasks, truncated, scannedFiles, counts };
}

/** Keep acknowledgements only for exactly matching current source comments. */
export function validatedSourceTaskReviews(scan: SourceTaskScan, value: unknown): string[] {
  if (!scan.ok || !Array.isArray(value) || value.length > MAX_SOURCE_TASKS) return [];
  const known = new Set(scan.tasks.map(task => task.id));
  const seen = new Set<string>();
  const accepted: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !known.has(item) || seen.has(item)) continue;
    accepted.push(item);
    seen.add(item);
  }
  return accepted;
}

export function toggleSourceTaskReview(
  scan: SourceTaskScan, reviewed: readonly string[], id: string,
): string[] {
  const accepted = validatedSourceTaskReviews(scan, reviewed);
  if (!scan.ok || !scan.tasks.some(task => task.id === id)) return accepted;
  return accepted.includes(id)
    ? accepted.filter(candidate => candidate !== id)
    : [...accepted, id].slice(0, MAX_SOURCE_TASKS);
}

export function filterSourceTasks(
  scan: SourceTaskScan, filter: SourceTaskFilter, reviewed: readonly string[],
): SourceTask[] {
  if (!scan.ok || !filter || typeof filter.query !== 'string' ||
      filter.query.length > MAX_SOURCE_TASK_QUERY ||
      (filter.tag !== 'all' && !SOURCE_TASK_TAGS.includes(filter.tag)) ||
      (filter.priority !== 'all' && !['urgent', 'normal', 'informational'].includes(filter.priority)) ||
      (filter.review !== 'all' && filter.review !== 'reviewed' && filter.review !== 'pending') ||
      (filter.path !== 'all' && !validPath(filter.path))) return [];
  const accepted = new Set(validatedSourceTaskReviews(scan, reviewed));
  const needle = filter.query.trim().toLocaleLowerCase();
  return scan.tasks.filter(task =>
    (filter.tag === 'all' || filter.tag === task.tag) &&
    (filter.priority === 'all' || filter.priority === task.priority) &&
    (filter.path === 'all' || filter.path === task.path) &&
    (filter.review === 'all' ||
      (filter.review === 'reviewed' ? accepted.has(task.id) : !accepted.has(task.id))) &&
    (!needle || (task.path + ' ' + task.tag + ' ' + task.summary)
      .toLocaleLowerCase().includes(needle)));
}

export function sourceTaskSummary(scan: SourceTaskScan, reviewed: readonly string[]):
  | { total: number; urgent: number; reviewed: number; pending: number; truncated: boolean }
  | null {
  if (!scan.ok) return null;
  const seen = validatedSourceTaskReviews(scan, reviewed).length;
  return {
    total: scan.tasks.length,
    urgent: scan.tasks.filter(task => task.priority === 'urgent').length,
    reviewed: seen,
    pending: scan.tasks.length - seen,
    truncated: scan.truncated,
  };
}
