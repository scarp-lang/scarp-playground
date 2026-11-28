import { describe, expect, it } from 'vitest';
import {
  MAX_PREFLIGHT_ACTIONS, planPreflightActions, summarizeActionPlan, visiblePreflightActions,
} from '../src/preflight-actions';
import {
  inspectProjectPreflight, type PreflightReport,
} from '../src/project-preflight';
import type { Workspace } from '../src/workspace';

function workspace(source = 'print(1);\n',
  other: Record<string, string> = {}): Workspace {
  return { entry: 'main.srp', files: { 'main.srp': source, ...other } };
}
function report(input = workspace()) {
  const value = inspectProjectPreflight(input);
  if (!value.ok) throw Error(value.error);
  return value;
}
const actions = (input = workspace()) => planPreflightActions(report(input));

describe('bounded and actionable project preflight review sequence', () => {
  it('always ends with official compiler verification for a clean workspace', () => {
    const items = actions();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'verify-with-compiler', requiresCompiler: true,
      severity: 'information',
    });
  });

  it('does not describe lexical preflight as a successful compiler run', () => {
    const item = actions()[0];
    expect(item.instruction).toContain('does not prove compiler correctness');
  });

  it('places missing import repair ahead of formatting advice', () => {
    const input = workspace('import "missing.srp" as missing;\n// tail  \n');
    const items = actions(input);
    expect(items[0].id).toBe('resolve-import-paths');
    expect(items.findIndex(item => item.id === 'review-readable-source'))
      .toBeGreaterThan(0);
  });

  it('groups repeated missing imports into one action instead of many controls', () => {
    const input = workspace(
      'import "missing/a.srp" as a;\nimport "missing/b.srp" as b;\n',
    );
    const items = actions(input);
    const missing = items.filter(item => item.id === 'resolve-import-paths');
    expect(missing).toHaveLength(1);
    expect(missing[0].count).toBe(2);
    expect(missing[0].paths).toEqual(['main.srp']);
  });

  it('provides a valid source coordinate for a missing module', () => {
    const item = actions(workspace('import "missing.srp" as x;'))[0];
    expect(item.firstLocation).toMatchObject({
      path: 'main.srp', line: 1,
    });
    expect(item.requiresCompiler).toBe(true);
  });

  it('groups invisible Unicode controls into one manual-review action', () => {
    const source = 'print("a\u202eb\u200bc");\n';
    const items = actions(workspace(source));
    const unicode = items.find(item => item.id === 'inspect-suspicious-unicode');
    expect(unicode).toBeDefined();
    expect(unicode?.severity).toBe('blocker');
    expect(unicode?.count).toBeGreaterThanOrEqual(2);
    expect(unicode?.instruction).toContain('string literals');
  });

  it('reports unsupported import syntax as a separate review category', () => {
    const items = actions(workspace('import "\\u{61}.srp" as a;'));
    expect(items.some(item => item.id === 'resolve-import-uncertainty')).toBe(true);
    expect(items.some(item => item.id === 'complete-inspection')).toBe(true);
  });

  it('does not assume disconnected modules must be deleted', () => {
    const items = actions(workspace('print(1);', {
      'unused.srp': 'print(2);',
    }));
    const remaining = items.find(item => item.id === 'review-other-findings');
    expect(remaining?.instruction).toContain('decide whether');
  });

  it('groups source style warnings without performing automatic cleanup', () => {
    const items = actions(workspace('print(42);  \n' + 'x'.repeat(150)));
    const style = items.find(item => item.id === 'review-readable-source');
    expect(style?.count).toBeGreaterThanOrEqual(2);
    expect(style?.instruction).toContain('preview conservative fixes');
  });

  it('identifies exact affected files without keeping source code', () => {
    const items = actions(workspace('print(1);', {
      'lib/a.srp': 'print(2);',
      'lib/b.srp': 'print(3);',
    }));
    const affected = summarizeActionPlan(items);
    expect(affected.affectedFiles).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(affected)).not.toContain('print(');
  });

  it('provides one quota review for several source files under pressure', () => {
    const input = workspace('a'.repeat(58_000), {
      'b.srp': 'b'.repeat(58_000),
    });
    const items = actions(input);
    const resource = items.filter(item => item.id === 'reduce-source-pressure');
    expect(resource).toHaveLength(1);
    expect(resource[0].count).toBeGreaterThanOrEqual(2);
  });

  it('does not turn quota warnings into claims about runtime memory', () => {
    const items = actions(workspace('x'.repeat(55_000)));
    const limit = items.find(item => item.id === 'reduce-source-pressure');
    expect(limit?.instruction).toContain('source');
    expect(limit?.instruction).not.toContain('runtime heap');
  });

  it('reports import-cycle review separately from missing-module repair', () => {
    const input = workspace('import "lib/a.srp" as a;\n', {
      'lib/a.srp': 'import "../main.srp" as root;\n',
    });
    const items = actions(input);
    expect(items.some(item => item.id === 'review-import-cycles')).toBe(true);
    expect(items.some(item => item.id === 'resolve-import-paths')).toBe(false);
  });

  it('does not duplicate a compiler verification instruction across action groups', () => {
    const items = actions(workspace(
      'import "missing.srp" as x;\nprint("a\u202eb");',
    ));
    expect(items.filter(item => item.id === 'verify-with-compiler')).toHaveLength(1);
  });

  it('reports the number of manual actions separately from the compiler check', () => {
    const items = actions(workspace('import "missing.srp" as x;\n'));
    const summary = summarizeActionPlan(items);
    expect(summary.total).toBe(items.length);
    expect(summary.manualReview).toBe(items.length - 1);
    expect(summary.compilerRequired).toBeGreaterThan(0);
  });

  it('preserves deterministic sorted action order across repeated scans', () => {
    const input = workspace('import "missing.srp" as x;\n// line  \n');
    expect(actions(input)).toEqual(actions(input));
    const items = actions(input);
    expect(items.map(item => item.rank)).toEqual(
      [...items.map(item => item.rank)].sort((a, b) => a - b),
    );
  });

  it('never returns more than the explicit action-count limit', () => {
    expect(actions().length).toBeLessThanOrEqual(MAX_PREFLIGHT_ACTIONS);
  });

  it('handles an invalid report without trying to synthesize a repair path', () => {
    const invalid: PreflightReport = { ok: false, error: 'Invalid project' };
    expect(planPreflightActions(invalid)).toEqual([]);
  });

  it('does not store or return current source contents with its steps', () => {
    const items = actions(workspace('print("PRIVATE_SOURCE_CONTENT");'));
    expect(JSON.stringify(items)).not.toContain('PRIVATE_SOURCE_CONTENT');
    expect(items.every(item => !Object.hasOwn(item, 'workspace'))).toBe(true);
  });

  it('summary is read-only and does not mutate the original review sequence', () => {
    const items = actions(workspace('print(42);'));
    const before = JSON.stringify(items);
    summarizeActionPlan(items);
    expect(JSON.stringify(items)).toBe(before);
  });

  it('reports severity blockers from suspicious Unicode prior to style issues', () => {
    const items = actions(workspace('print("x\u202ey");  \n'));
    const suspicious = items.find(item => item.id === 'inspect-suspicious-unicode');
    const style = items.find(item => item.id === 'review-readable-source');
    expect(suspicious?.rank).toBeLessThan(style!.rank);
  });

  it('retains a final Check/Verify requirement when all prior findings are informational', () => {
    const items = actions(workspace('print(1);', {
      'standalone.srp': 'print(2);',
    }));
    expect(items.at(-1)?.id).toBe('verify-with-compiler');
    expect(items.at(-1)?.requiresCompiler).toBe(true);
  });
});


describe('compact priority review mode', () => {
  it('keeps every action visible when the urgent-only mode is disabled', () => {
    const all = actions(workspace('print(42);', {
      'standalone.srp': 'print(2);',
    }));
    expect(visiblePreflightActions(all, false)).toEqual(all);
  });

  it('filters informational-only advice while retaining official compiler verification', () => {
    const all = actions(workspace('print(42);', {
      'standalone.srp': 'print(2);',
    }));
    const focused = visiblePreflightActions(all, true);
    expect(focused.every(item =>
      item.id === 'verify-with-compiler' || item.severity !== 'information')).toBe(true);
    expect(focused.at(-1)?.id).toBe('verify-with-compiler');
  });

  it('does not hide import blockers from focused review', () => {
    const all = actions(workspace('import "missing.srp" as x;\n'));
    const focused = visiblePreflightActions(all, true);
    expect(focused.some(item => item.id === 'resolve-import-paths')).toBe(true);
  });

  it('does not mutate the original action collection or reorder its ranks', () => {
    const all = actions(workspace('print(42);\n'));
    const before = JSON.stringify(all);
    visiblePreflightActions(all, true);
    expect(JSON.stringify(all)).toBe(before);
  });
});
