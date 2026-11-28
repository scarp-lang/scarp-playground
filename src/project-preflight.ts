import { inspectModuleGraph } from './module-graph';
import { analyzeSourceHygiene } from './source-hygiene';
import { inspectWorkspaceBudget } from './workspace-budget';
import { validateWorkspace, type Workspace } from './workspace';

export const MAX_PREFLIGHT_ISSUES = 240;
export const MAX_PREFLIGHT_QUERY = 96;
export const MAX_PREFLIGHT_DELTA = 80;

export type PreflightSeverity = 'blocker' | 'warning' | 'information';
export type PreflightCategory = 'imports' | 'hygiene' | 'limits' | 'structure';
export type PreflightIssue = Readonly<{
  id: string;
  category: PreflightCategory;
  severity: PreflightSeverity;
  path: string | null;
  line: number | null;
  column: number | null;
  code: string;
  message: string;
  guidance: string;
}>;

export type PreflightReport =
  | { ok: true; issues: PreflightIssue[];
      complete: boolean; truncated: boolean; fileCount: number;
      blockerCount: number; warningCount: number; informationCount: number;
      checkedSources: number; checkedImports: number; totalBytes: number;
      entry: string }
  | { ok: false; error: string };

export type PreflightFilter = Readonly<{
  category: PreflightCategory | 'all';
  severity: PreflightSeverity | 'all';
  query: string;
  path: string | 'all';
}>;

export type PreflightSnapshot = Readonly<{
  sourceCount: number;
  entry: string;
  issues: Array<Pick<PreflightIssue, 'id' | 'category' | 'severity' |
    'path' | 'line' | 'column' | 'code' | 'message' | 'guidance'>>;
}>;

export type PreflightDelta = Readonly<{
  introduced: PreflightIssue[];
  resolved: PreflightIssue[];
  unchanged: number;
  truncated: boolean;
}>;

const RULE_GUIDANCE: Record<string, string> = {
  'bidi-control': 'Inspect and remove disguised bidirectional controls manually.',
  'invisible-character': 'Inspect invisible Unicode; do not delete blindly inside strings.',
  'control-character': 'Review the unprintable character and whether it belongs in a string.',
  'nonbreaking-space': 'Review nonbreaking spaces, which resemble ordinary spaces.',
  'mixed-line-endings': 'Normalize outside literal strings using an explicit, reviewed edit.',
  'mixed-indentation': 'Choose tabs or spaces consistently without altering string literals.',
  'trailing-whitespace': 'Review a source hygiene cleanup preview before applying.',
  'missing-final-newline': 'Review whether a conventional final newline is suitable.',
  'long-line': 'Consider splitting long expressions into readable lines.',
};

function idFor(
  category: PreflightCategory, code: string,
  path: string | null, line: number | null, column: number | null,
): string {
  return JSON.stringify([category, code, path, line, column]);
}

function item(
  category: PreflightCategory, severity: PreflightSeverity, code: string,
  path: string | null, line: number | null, column: number | null,
  message: string, guidance: string,
): PreflightIssue {
  return {
    id: idFor(category, code, path, line, column),
    category, severity, path, line, column, code, message, guidance,
  };
}

/**
 * Deterministic, local-only preflight. It combines *advisory lexical*
 * inspections, which can never replace the official Scarp compiler's Check
 * and Verify operations. Source text, stdin and output are absent from all
 * results, and the report never modifies or persists a project.
 */
export function inspectProjectPreflight(workspace: Workspace): PreflightReport {
  const invalid = validateWorkspace(workspace);
  if (invalid) return { ok: false, error: invalid };
  const graph = inspectModuleGraph(workspace);
  const hygiene = analyzeSourceHygiene(workspace);
  const budget = inspectWorkspaceBudget(workspace);
  if (!hygiene.ok || !budget.ok) {
    return { ok: false, error: 'Cannot safely inspect the current Scarp project.' };
  }
  const issues: PreflightIssue[] = [];
  let truncated = false;
  const seen = new Set<string>();
  const add = (issue: PreflightIssue) => {
    if (seen.has(issue.id)) return;
    seen.add(issue.id);
    if (issues.length >= MAX_PREFLIGHT_ISSUES) {
      truncated = true;
      return;
    }
    issues.push(issue);
  };

  for (const node of graph.nodes) {
    for (const edge of node.outgoing) {
      if (edge.status === 'missing') {
        add(item('imports', 'blocker', 'missing-module',
          edge.importer, edge.line, edge.column,
          'Local import does not resolve to a workspace file: ' + edge.specifier,
          'Check the .srp path and consider explicit missing-import repair.'));
      } else if (edge.status === 'invalid') {
        add(item('imports', 'warning', 'unrecognized-import',
          edge.importer, edge.line, edge.column,
          'Import spelling cannot be resolved by the lexical project scanner.',
          'Use the Rust compiler Check operation; do not assume this import is invalid.'));
      }
    }
    if (graph.complete && !node.reached) {
      add(item('structure', 'information', 'not-reached',
        node.path, 1, 1,
        'This source file is not reached from the selected entrypoint by known local imports.',
        'It may be intentionally standalone; review before deleting or moving.'));
    }
    if (graph.complete && node.cycle) {
      add(item('structure', 'warning', 'import-cycle',
        node.path, 1, 1,
        'This file belongs to a cycle in the lexical local import graph.',
        'Review circular dependencies using Module dependencies and compiler Check.'));
    }
  }

  for (const issue of hygiene.issues) {
    const severity: PreflightSeverity =
      issue.severity === 'security' ? 'blocker' :
        issue.severity === 'warning' ? 'warning' : 'information';
    add(item('hygiene', severity, issue.rule,
      issue.path, issue.line, issue.column,
      issue.message, RULE_GUIDANCE[issue.rule] ?? 'Review the source location.'));
  }

  for (const file of budget.files) {
    if (file.condition === 'normal') continue;
    add(item('limits', file.condition === 'at-limit' ? 'warning' : 'information',
      'file-quota', file.path, 1, 1,
      'Source file uses ' + file.bytes + ' / ' + file.quotaBytes + ' UTF-8 bytes.',
      'Keep source below the per-file limit before adding more content.'));
  }
  if (budget.totalCondition !== 'normal') {
    add(item('limits', 'warning', 'project-quota', null, null, null,
      'The project uses ' + budget.totalBytes + ' / ' + budget.quotaTotalBytes +
      ' available source bytes.',
      'Split independent modules into smaller Playground sessions if needed.'));
  }
  if (budget.fileCountCondition !== 'normal') {
    add(item('limits', 'information', 'file-slots', null, null, null,
      'The project uses ' + budget.fileCount + ' / ' + budget.quotaFiles + ' file slots.',
      'Check remaining file capacity before importing or scaffolding modules.'));
  }

  if (!graph.complete) {
    add(item('structure', 'warning', 'incomplete-graph', null, null, null,
      'The lexical import graph is incomplete; negative reachability is unknown.',
      'Resolve unsupported import spellings and recheck using the real compiler.'));
  }
  if (hygiene.truncated) {
    add(item('hygiene', 'warning', 'hygiene-truncated', null, null, null,
      'Hygiene findings exceeded their display cap.',
      'Review and address findings in smaller source files.'));
  }

  issues.sort((a, b) => {
    const rank: Record<PreflightSeverity, number> = {
      blocker: 0, warning: 1, information: 2,
    };
    return rank[a.severity] - rank[b.severity] ||
      a.category.localeCompare(b.category) ||
      (a.path ?? '').localeCompare(b.path ?? '') ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      a.code.localeCompare(b.code);
  });
  return {
    ok: true, issues, complete: !truncated && !hygiene.truncated && graph.complete,
    truncated: truncated || hygiene.truncated, fileCount: budget.fileCount,
    blockerCount: issues.filter(issue => issue.severity === 'blocker').length,
    warningCount: issues.filter(issue => issue.severity === 'warning').length,
    informationCount: issues.filter(issue => issue.severity === 'information').length,
    checkedSources: budget.fileCount, checkedImports: graph.scannedImports,
    totalBytes: budget.totalBytes, entry: workspace.entry,
  };
}

export function filterProjectPreflight(
  report: PreflightReport, filter: PreflightFilter,
): PreflightIssue[] {
  if (!report.ok || !filter || typeof filter.query !== 'string' ||
      filter.query.length > MAX_PREFLIGHT_QUERY ||
      !['imports', 'hygiene', 'limits', 'structure', 'all'].includes(filter.category) ||
      !['blocker', 'warning', 'information', 'all'].includes(filter.severity) ||
      typeof filter.path !== 'string') return [];
  const q = filter.query.toLocaleLowerCase().trim();
  return report.issues.filter(issue =>
    (filter.category === 'all' || issue.category === filter.category) &&
    (filter.severity === 'all' || issue.severity === filter.severity) &&
    (filter.path === 'all' || issue.path === filter.path) &&
    (!q || (issue.code + ' ' + issue.message + ' ' +
      issue.guidance + ' ' + (issue.path ?? '')).toLocaleLowerCase().includes(q)));
}

/** Capture issue metadata, never source text, for a temporary before/after comparison. */
export function capturePreflightSnapshot(report: PreflightReport): PreflightSnapshot | null {
  if (!report.ok || !report.complete) return null;
  return {
    entry: report.entry, sourceCount: report.fileCount,
    issues: report.issues.map(issue => ({ ...issue })),
  };
}

/** Report newly introduced or resolved facts; never infer compiler correctness. */
export function comparePreflightSnapshot(
  before: PreflightSnapshot | null, current: PreflightReport,
): PreflightDelta | null {
  if (!before || !current.ok || !current.complete ||
      !Array.isArray(before.issues) || before.issues.length > MAX_PREFLIGHT_ISSUES ||
      typeof before.entry !== 'string' || typeof before.sourceCount !== 'number') return null;
  const old = new Map(before.issues.map(issue => [issue.id, issue]));
  const now = new Map(current.issues.map(issue => [issue.id, issue]));
  const introduced = current.issues.filter(issue => !old.has(issue.id));
  const resolved = before.issues.filter(issue => !now.has(issue.id));
  return {
    introduced: introduced.slice(0, MAX_PREFLIGHT_DELTA),
    resolved: resolved.slice(0, MAX_PREFLIGHT_DELTA),
    unchanged: current.issues.length - introduced.length,
    truncated: introduced.length > MAX_PREFLIGHT_DELTA || resolved.length > MAX_PREFLIGHT_DELTA,
  };
}
