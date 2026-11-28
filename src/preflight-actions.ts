import type {
  PreflightIssue, PreflightReport, PreflightSeverity,
} from './project-preflight';

export const MAX_PREFLIGHT_ACTIONS = 24;

export type PreflightAction = Readonly<{
  id: string;
  rank: number;
  severity: PreflightSeverity;
  title: string;
  instruction: string;
  count: number;
  paths: string[];
  firstLocation: { path: string; line: number; column: number } | null;
  requiresCompiler: boolean;
}>;

type RuleGroup = Readonly<{
  id: string;
  rank: number;
  title: string;
  instruction: string;
  requiresCompiler: boolean;
}>;

function bucket(issue: PreflightIssue): RuleGroup {
  switch (issue.code) {
    case 'missing-module':
      return {
        id: 'resolve-import-paths', rank: 0,
        title: 'Resolve missing source imports',
        instruction: 'Inspect each missing module path. Select explicit replacements only after checking module exports.',
        requiresCompiler: true,
      };
    case 'bidi-control':
    case 'control-character':
    case 'invisible-character':
    case 'nonbreaking-space':
      return {
        id: 'inspect-suspicious-unicode', rank: 1,
        title: 'Inspect ambiguous or invisible source characters',
        instruction: 'Review source coordinates in the editor. Do not automatically remove characters inside string literals.',
        requiresCompiler: true,
      };
    case 'unrecognized-import':
    case 'incomplete-graph':
      return {
        id: 'resolve-import-uncertainty', rank: 2,
        title: 'Resolve unsupported import spellings',
        instruction: 'Run compiler Check to validate import syntax; the lexical graph may be incomplete.',
        requiresCompiler: true,
      };
    case 'import-cycle':
      return {
        id: 'review-import-cycles', rank: 3,
        title: 'Review circular local imports',
        instruction: 'Inspect import relationships and confirm any cycle is intentional using compiler Check.',
        requiresCompiler: true,
      };
    case 'file-quota':
    case 'project-quota':
    case 'file-slots':
      return {
        id: 'reduce-source-pressure', rank: 4,
        title: 'Review source quota pressure',
        instruction: 'Inspect exact UTF-8 sizes. Split or simplify modules without silently discarding source.',
        requiresCompiler: false,
      };
    case 'long-line':
    case 'mixed-indentation':
    case 'mixed-line-endings':
    case 'trailing-whitespace':
    case 'missing-final-newline':
      return {
        id: 'review-readable-source', rank: 5,
        title: 'Review source formatting',
        instruction: 'Use Source hygiene to preview conservative fixes; manually inspect string-sensitive changes.',
        requiresCompiler: false,
      };
    default:
      return {
        id: 'review-other-findings', rank: 6,
        title: 'Inspect remaining advisory findings',
        instruction: 'Open the cited source positions and decide whether each finding needs action.',
        requiresCompiler: false,
      };
  }
}

/**
 * Derive actionable, deduplicated review steps without replaying source text.
 * Higher-risk findings come first, followed by the mandatory compiler check.
 * A review plan is not a build or run result, nor an authorization to edit.
 */
export function planPreflightActions(report: PreflightReport): PreflightAction[] {
  if (!report.ok) return [];
  const groups = new Map<string, {
    rule: RuleGroup;
    issues: PreflightIssue[];
  }>();
  for (const issue of report.issues) {
    const rule = bucket(issue);
    const group = groups.get(rule.id);
    if (group) group.issues.push(issue);
    else groups.set(rule.id, { rule, issues: [issue] });
  }
  const result: PreflightAction[] = [];
  for (const { rule, issues } of groups.values()) {
    const severity: PreflightSeverity = issues.some(issue => issue.severity === 'blocker')
      ? 'blocker'
      : issues.some(issue => issue.severity === 'warning') ? 'warning' : 'information';
    const located = issues.find(issue =>
      issue.path !== null && issue.line !== null && issue.column !== null);
    result.push({
      id: rule.id, rank: rule.rank, severity,
      title: rule.title, instruction: rule.instruction,
      count: issues.length,
      paths: [...new Set(issues.map(issue => issue.path).filter(
        (path): path is string => path !== null))].sort(),
      firstLocation: located
        ? { path: located.path!, line: located.line!, column: located.column! }
        : null,
      requiresCompiler: rule.requiresCompiler,
    });
  }
  result.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  if (!report.complete) {
    result.push({
      id: 'complete-inspection', rank: 7, severity: 'warning',
      title: 'Complete the source inspection',
      instruction: 'Reduce oversized finding sets or unsupported imports before relying on missing-findings claims.',
      count: 1, paths: [], firstLocation: null, requiresCompiler: true,
    });
  }
  result.push({
    id: 'verify-with-compiler', rank: 8, severity: 'information',
    title: 'Run the official Scarp compiler checks',
    instruction: 'Use Check or Verify after reviewing edits. A clean lexical preflight does not prove compiler correctness.',
    count: 1, paths: [], firstLocation: null, requiresCompiler: true,
  });
  return result.slice(0, MAX_PREFLIGHT_ACTIONS);
}

export function summarizeActionPlan(actions: readonly PreflightAction[]) {
  return {
    total: actions.length,
    manualReview: actions.filter(action => action.id !== 'verify-with-compiler').length,
    compilerRequired: actions.filter(action => action.requiresCompiler).length,
    blockers: actions.filter(action => action.severity === 'blocker').length,
    affectedFiles: [...new Set(actions.flatMap(action => action.paths))].length,
  };
}


/**
 * Compact review mode keeps actionable blockers and warnings in view while
 * retaining the compiler verification step even on otherwise clean projects.
 * Never use this display filter to dismiss informational findings.
 */
export function visiblePreflightActions(
  actions: readonly PreflightAction[], urgentOnly: boolean,
): PreflightAction[] {
  if (!urgentOnly) return [...actions];
  return actions.filter(action =>
    action.id === 'verify-with-compiler' ||
    action.severity === 'blocker' || action.severity === 'warning');
}
