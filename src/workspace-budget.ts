import { inspectModuleGraph } from './module-graph';
import {
  MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES,
  validateWorkspace, type Workspace,
} from './workspace';

export const WORKSPACE_BUDGET_WARNING_RATIO = 0.8;
export const WORKSPACE_LONG_LINE_THRESHOLD = 140;
export const MAX_BUDGET_LONG_LINES = 20;
export const MAX_BUDGET_FILTER_LENGTH = 96;

export type BudgetCondition = 'normal' | 'approaching' | 'at-limit';
export type WorkspaceFileBudget = Readonly<{
  path: string;
  isEntry: boolean;
  bytes: number;
  quotaBytes: number;
  utilization: number;
  lines: number;
  emptyLines: number;
  longestLine: number;
  longestLineAt: number;
  utf16Units: number;
  unicodeScalars: number;
  nonAsciiScalars: number;
  newline: { crlf: number; lf: number; cr: number };
  outgoingImports: number;
  incomingImports: number;
  unresolvedImports: number;
  reachableFromEntry: boolean | null;
  partOfCycle: boolean | null;
  condition: BudgetCondition;
}>;
export type WorkspaceLongLine = Readonly<{
  path: string; line: number; units: number;
}>;
export type WorkspaceBudgetReport =
  | { ok: true; files: WorkspaceFileBudget[];
      entry: string; fileCount: number; totalBytes: number;
      totalLines: number; totalUnicodeScalars: number;
      totalNonAsciiScalars: number;
      totalImports: number; invalidImports: number; missingImports: number;
      graphComplete: boolean; graphIssues: string[];
      longLines: WorkspaceLongLine[]; longLinesTruncated: boolean;
      totalCondition: BudgetCondition; fileCountCondition: BudgetCondition;
      byteHeadroom: number; availableFileSlots: number;
      quotaFiles: number; quotaTotalBytes: number; quotaFileBytes: number }
  | { ok: false; error: string };

export type BudgetSort = 'path' | 'bytes' | 'lines' | 'longest-line' | 'imports';
export type BudgetFilter = Readonly<{
  query: string;
  sortBy: BudgetSort;
  descending: boolean;
  conditions: BudgetCondition | 'all';
  onlyReachable: boolean;
}>;

export function budgetCondition(used: number, limit: number): BudgetCondition {
  if (!Number.isSafeInteger(used) || !Number.isSafeInteger(limit) || limit < 1 ||
      used < 0) return 'at-limit';
  if (used >= limit) return 'at-limit';
  if (used / limit >= WORKSPACE_BUDGET_WARNING_RATIO) return 'approaching';
  return 'normal';
}

type PhysicalStats = {
  lines: number; empty: number; longest: number; longestAt: number;
  crlf: number; lf: number; cr: number;
  unicode: number; nonAscii: number;
  longLines: Array<{ line: number; units: number }>;
};

function physicalStats(source: string): PhysicalStats {
  let line = 1, start = 0, longest = 0, longestAt = 1;
  let crlf = 0, lf = 0, cr = 0, empty = 0;
  const longLines: Array<{ line: number; units: number }> = [];
  const inspect = (end: number) => {
    const length = end - start;
    if (length === 0) empty++;
    if (length > longest) { longest = length; longestAt = line; }
    if (length > WORKSPACE_LONG_LINE_THRESHOLD) {
      longLines.push({ line, units: length });
    }
    line++;
    start = end;
  };
  for (let index = 0; index < source.length; index++) {
    const ch = source[index];
    if (ch === '\r') {
      inspect(index);
      if (source[index + 1] === '\n') {
        crlf++;
        index++;
      } else cr++;
      start = index + 1;
    } else if (ch === '\n') {
      inspect(index);
      lf++;
      start = index + 1;
    }
  }
  inspect(source.length);
  let unicode = 0, nonAscii = 0;
  for (const scalar of source) {
    unicode++;
    if (scalar.codePointAt(0)! > 127) nonAscii++;
  }
  return {
    lines: line - 1, empty, longest, longestAt,
    crlf, lf, cr, unicode, nonAscii, longLines,
  };
}

/**
 * Resource accounting uses exact TextEncoder UTF-8 bytes and the same
 * validated virtual workspace as the browser worker. Import reachability
 * remains unknown when lexical parsing is incomplete; this is not an
 * optimizing compiler or a memory profiler.
 */
export function inspectWorkspaceBudget(workspace: Workspace): WorkspaceBudgetReport {
  const problem = validateWorkspace(workspace);
  if (problem) return { ok: false, error: problem };
  const graph = inspectModuleGraph(workspace);
  const byPath = new Map(graph.nodes.map(node => [node.path, node]));
  const encoder = new TextEncoder();
  const files: WorkspaceFileBudget[] = [];
  const longLines: WorkspaceLongLine[] = [];
  let totalBytes = 0, totalLines = 0, totalUnicodeScalars = 0;
  let totalNonAsciiScalars = 0, invalidImports = 0, missingImports = 0;
  let totalImports = 0, longLinesTruncated = false;
  for (const path of Object.keys(workspace.files).sort()) {
    const source = workspace.files[path];
    const bytes = encoder.encode(source).byteLength;
    const stats = physicalStats(source);
    const node = byPath.get(path);
    const edges = node?.outgoing ?? [];
    const invalid = edges.filter(item => item.status === 'invalid').length;
    const missing = edges.filter(item => item.status === 'missing').length;
    invalidImports += invalid;
    missingImports += missing;
    totalImports += edges.length;
    totalBytes += bytes;
    totalLines += stats.lines;
    totalUnicodeScalars += stats.unicode;
    totalNonAsciiScalars += stats.nonAscii;
    for (const site of stats.longLines) {
      if (longLines.length < MAX_BUDGET_LONG_LINES) {
        longLines.push({ path, line: site.line, units: site.units });
      } else longLinesTruncated = true;
    }
    files.push({
      path, isEntry: workspace.entry === path, bytes,
      quotaBytes: MAX_FILE_BYTES, utilization: bytes / MAX_FILE_BYTES,
      lines: stats.lines, emptyLines: stats.empty, longestLine: stats.longest,
      longestLineAt: stats.longestAt,
      utf16Units: source.length, unicodeScalars: stats.unicode,
      nonAsciiScalars: stats.nonAscii,
      newline: { crlf: stats.crlf, lf: stats.lf, cr: stats.cr },
      outgoingImports: edges.length,
      incomingImports: node?.incoming.length ?? 0,
      unresolvedImports: invalid + missing,
      reachableFromEntry: graph.complete ? Boolean(node?.reached) : null,
      partOfCycle: graph.complete ? Boolean(node?.cycle) : null,
      condition: budgetCondition(bytes, MAX_FILE_BYTES),
    });
  }
  return {
    ok: true, files, entry: workspace.entry, fileCount: files.length,
    totalBytes, totalLines, totalUnicodeScalars, totalNonAsciiScalars,
    totalImports, invalidImports, missingImports,
    graphComplete: graph.complete, graphIssues: graph.issues.slice(0, 12),
    longLines, longLinesTruncated,
    totalCondition: budgetCondition(totalBytes, MAX_TOTAL_BYTES),
    fileCountCondition: budgetCondition(files.length, MAX_FILES),
    byteHeadroom: MAX_TOTAL_BYTES - totalBytes,
    availableFileSlots: MAX_FILES - files.length,
    quotaFiles: MAX_FILES, quotaTotalBytes: MAX_TOTAL_BYTES,
    quotaFileBytes: MAX_FILE_BYTES,
  };
}

/** Filtering and sorting never evaluate Scarp text or alter the resource report. */
export function filterWorkspaceBudgets(
  report: WorkspaceBudgetReport, filter: BudgetFilter,
): WorkspaceFileBudget[] {
  if (!report.ok || !filter || typeof filter.query !== 'string' ||
      filter.query.length > MAX_BUDGET_FILTER_LENGTH ||
      !['path', 'bytes', 'lines', 'longest-line', 'imports'].includes(filter.sortBy) ||
      typeof filter.descending !== 'boolean' ||
      !['normal', 'approaching', 'at-limit', 'all'].includes(filter.conditions) ||
      typeof filter.onlyReachable !== 'boolean') return [];
  const needle = filter.query.toLocaleLowerCase();
  const files = report.files.filter(file =>
    file.path.toLocaleLowerCase().includes(needle) &&
    (filter.conditions === 'all' || file.condition === filter.conditions) &&
    (!filter.onlyReachable || file.reachableFromEntry === true));
  const key = (file: WorkspaceFileBudget): number => {
    switch (filter.sortBy) {
      case 'bytes': return file.bytes;
      case 'lines': return file.lines;
      case 'longest-line': return file.longestLine;
      case 'imports': return file.outgoingImports;
      default: return 0;
    }
  };
  return files.sort((a, b) => {
    const compared = filter.sortBy === 'path'
      ? a.path.localeCompare(b.path) : key(a) - key(b);
    return filter.descending ? -compared : compared;
  });
}
