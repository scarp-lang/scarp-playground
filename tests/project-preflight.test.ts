import { describe, expect, it } from 'vitest';
import {
  MAX_PREFLIGHT_ISSUES, MAX_PREFLIGHT_QUERY, MAX_PREFLIGHT_DELTA,
  inspectProjectPreflight, filterProjectPreflight,
  capturePreflightSnapshot, comparePreflightSnapshot,
  type PreflightFilter, type PreflightIssue,
} from '../src/project-preflight';
import type { Workspace } from '../src/workspace';

const workspace = (source = 'print(42);\n',
  extra: Record<string, string> = {}): Workspace => ({
  entry: 'main.srp', files: { 'main.srp': source, ...extra },
});
function report(value = workspace()) {
  const result = inspectProjectPreflight(value);
  if (!result.ok) throw Error(result.error);
  return result;
}
function filter(overrides: Partial<PreflightFilter> = {}): PreflightFilter {
  return { category: 'all', severity: 'all', query: '',
    path: 'all', ...overrides };
}

describe('consolidated source preflight inspection', () => {
  it('reports a valid simple Scarp workspace with no fabricated compiler success', () => {
    const result = report();
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.blockerCount).toBe(0);
    expect(result.entry).toBe('main.srp');
    expect(result.checkedSources).toBe(1);
    expect(result.fileCount).toBe(1);
  });

  it('reports exact source bytes without revealing source text in metadata', () => {
    const result = report(workspace('print("😀");\n'));
    expect(result.totalBytes).toBe(new TextEncoder().encode('print("😀");\n').byteLength);
    expect(Object.keys(result)).not.toContain('source');
    expect(Object.keys(result)).not.toContain('stdin');
  });

  it('treats a missing local import as a preflight blocker with a navigable site', () => {
    const result = report(workspace('import "missing.srp" as missing;\n'));
    expect(result.blockerCount).toBeGreaterThan(0);
    expect(result.issues.find(item => item.code === 'missing-module')).toMatchObject({
      category: 'imports', severity: 'blocker',
      path: 'main.srp', line: 1,
    });
    expect(result.issues.some(issue =>
      issue.guidance.includes('missing-import repair'))).toBe(true);
  });

  it('does not claim that a missing file has actually been parsed by the compiler', () => {
    const result = report(workspace('import "missing.srp" as missing;\n'));
    expect(result.issues.find(item => item.code === 'missing-module')?.message)
      .toContain('workspace file');
    expect(result.issues.every(item => !item.message.includes('type error'))).toBe(true);
  });

  it('does not report resolving local module imports as missing', () => {
    const result = report(workspace('import "lib/x.srp" as x;\n', {
      'lib/x.srp': 'pub bind x = 1;\n',
    }));
    expect(result.issues.some(item => item.code === 'missing-module')).toBe(false);
    expect(result.checkedImports).toBe(1);
  });

  it('reports unsupported lexical import strings conservatively', () => {
    const result = report(workspace('import "\\u{61}.srp" as a;\n', {
      'a.srp': 'print(1);',
    }));
    expect(result.complete).toBe(false);
    expect(result.issues.some(item => item.code === 'incomplete-graph')).toBe(true);
    expect(result.issues.some(item => item.code === 'unrecognized-import')).toBe(true);
    expect(result.issues.some(item => item.code === 'not-reached')).toBe(false);
  });

  it('lists disconnected local modules only if graph inspection is complete', () => {
    const result = report(workspace('print(42);\n', {
      'lib/not_reached.srp': 'pub bind value = 42;\n',
    }));
    const disconnected = result.issues.find(item => item.code === 'not-reached');
    expect(disconnected).toMatchObject({
      severity: 'information', category: 'structure',
      path: 'lib/not_reached.srp', line: 1,
    });
    expect(disconnected?.guidance).toContain('intentionally standalone');
  });

  it('reports import cycles without claiming a specific compiler error', () => {
    const result = report(workspace('import "lib/a.srp" as a;\n', {
      'lib/a.srp': 'import "../main.srp" as main;\n',
    }));
    expect(result.issues.filter(item => item.code === 'import-cycle')).toHaveLength(2);
    expect(result.issues.filter(item => item.code === 'import-cycle')
      .every(item => item.severity === 'warning')).toBe(true);
  });

  it('treats bidirectional control codepoints as source review blockers', () => {
    const result = report(workspace('print("ab\u202ecd");\n'));
    expect(result.issues.some(item =>
      item.code === 'bidi-control' && item.severity === 'blocker')).toBe(true);
  });

  it('does not silently erase or repair invisible source characters', () => {
    const source = 'print("hello\u200bworld");\n';
    const original = workspace(source);
    const before = JSON.stringify(original);
    const result = report(original);
    expect(result.issues.some(item => item.code === 'invisible-character')).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
  });

  it('detects missing final newline as informational style feedback', () => {
    const result = report(workspace('print(42);'));
    expect(result.issues.some(item =>
      item.code === 'missing-final-newline' &&
      item.severity === 'information')).toBe(true);
  });

  it('tracks whitespace hygiene without executing source code', () => {
    const result = report(workspace('print(42);  \n'));
    expect(result.issues.some(item => item.code === 'trailing-whitespace')).toBe(true);
  });

  it('does not incorrectly equate long source lines with compiler errors', () => {
    const result = report(workspace('print("' + 'x'.repeat(160) + '");\n'));
    const issue = result.issues.find(item => item.code === 'long-line');
    expect(issue?.severity).toBe('information');
    expect(issue?.category).toBe('hygiene');
  });

  it('reports per-file quota pressure using exact source byte limits', () => {
    const result = report(workspace('x'.repeat(Math.floor(64 * 1024 * 0.9))));
    const quota = result.issues.find(item => item.code === 'file-quota');
    expect(quota?.category).toBe('limits');
    expect(quota?.path).toBe('main.srp');
  });

  it('reports the project-level source byte limit independently', () => {
    const result = report(workspace('a'.repeat(64 * 1024), {
      'other.srp': 'b'.repeat(64 * 1024),
    }));
    expect(result.totalBytes).toBe(128 * 1024);
    expect(result.issues.some(item => item.code === 'project-quota')).toBe(true);
  });

  it('reports nearing the twelve-file quota without mutating workspace', () => {
    const extra = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => ['file' + i + '.srp', '']),
    );
    const result = report(workspace('', extra));
    expect(result.fileCount).toBe(12);
    expect(result.issues.some(item => item.code === 'file-slots')).toBe(true);
  });

  it('assigns stable diagnostic IDs to exactly the same source locations', () => {
    const a = report(workspace('print(1);'));
    const b = report(workspace('print(1);'));
    expect(a.issues.map(item => item.id)).toEqual(b.issues.map(item => item.id));
  });

  it('sorts issues by blocker, warning and information severity', () => {
    const result = report(workspace(
      'import "missing.srp" as x;\n// ' + 'x'.repeat(170) + '\n',
    ));
    const priorities = result.issues.map(item => ({
      blocker: 0, warning: 1, information: 2,
    })[item.severity]);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  it('deduplicates exact repeated issue locations and codes', () => {
    const result = report(workspace('print(42); \n'));
    const ids = result.issues.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never stores source file contents in the result envelope', () => {
    const source = 'print("DO_NOT_STORE_THIS_SOURCE");\n';
    const result = report(workspace(source));
    expect(JSON.stringify(result)).not.toContain('DO_NOT_STORE_THIS_SOURCE');
  });

  it('rejects malformed and invalid Unicode source files before scanning', () => {
    expect(inspectProjectPreflight(null as unknown as Workspace).ok).toBe(false);
    expect(inspectProjectPreflight(workspace('\uD800')).ok).toBe(false);
  });

  it('caps the number of findings without suppressing the incomplete flag', () => {
    const input = workspace('x '.repeat(18000));
    const result = inspectProjectPreflight(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues.length).toBeLessThanOrEqual(MAX_PREFLIGHT_ISSUES);
  });
});

describe('preflight filtering and regressions between snapshots', () => {
  const initial = report(workspace('import "missing.srp" as x;\n// TODO: review  \n', {
    'lib/unused.srp': 'print(2);',
  }));

  it('filters import blockers without mixing source hygiene suggestions', () => {
    const issues = filterProjectPreflight(initial,
      filter({ category: 'imports', severity: 'blocker' }));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('missing-module');
  });

  it('searches advisory issue text and path case-insensitively', () => {
    const issues = filterProjectPreflight(initial, filter({ query: 'MISSING' }));
    expect(issues.some(item => item.code === 'missing-module')).toBe(true);
  });

  it('restricts an exact file without returning project-level issues', () => {
    const issues = filterProjectPreflight(initial,
      filter({ path: 'lib/unused.srp' }));
    expect(issues.every(item => item.path === 'lib/unused.srp')).toBe(true);
  });

  it('rejects invalid category, severity and excessive filters', () => {
    for (const invalid of [
      { category: 'security' as PreflightFilter['category'] },
      { severity: 'error' as PreflightFilter['severity'] },
      { query: 'x'.repeat(MAX_PREFLIGHT_QUERY + 1) },
    ]) {
      expect(filterProjectPreflight(initial, filter(invalid))).toEqual([]);
    }
  });

  it('captures source-free issue records with counts for a complete report', () => {
    const baseline = capturePreflightSnapshot(initial);
    expect(baseline).not.toBeNull();
    expect(baseline?.sourceCount).toBe(2);
    expect(Object.keys(baseline!).sort()).toEqual(['entry', 'issues', 'sourceCount']);
    expect(JSON.stringify(baseline)).not.toContain('TODO: review');
  });

  it('rejects snapshots from incomplete import graphs', () => {
    const incomplete = report(workspace('import "\\u{61}.srp" as a;\n'));
    expect(incomplete.complete).toBe(false);
    expect(capturePreflightSnapshot(incomplete)).toBeNull();
  });

  it('recognizes unchanged preflight findings as unchanged, not reintroduced', () => {
    const baseline = capturePreflightSnapshot(initial);
    const delta = comparePreflightSnapshot(baseline, initial);
    expect(delta).not.toBeNull();
    expect(delta?.introduced).toEqual([]);
    expect(delta?.resolved).toEqual([]);
    expect(delta?.unchanged).toBe(initial.issues.length);
  });

  it('detects a removed missing-import blocker after local source repair', () => {
    const baseline = capturePreflightSnapshot(initial);
    const current = report(workspace('import "lib/unused.srp" as x;\n// TODO: review  \n', {
      'lib/unused.srp': 'print(2);',
    }));
    const delta = comparePreflightSnapshot(baseline, current);
    expect(delta?.resolved.some(item => item.code === 'missing-module')).toBe(true);
  });

  it('detects an introduced unsafe Unicode control after editing', () => {
    const before = report(workspace('print(42);\n'));
    const after = report(workspace('print("a\u202eb");\n'));
    const delta = comparePreflightSnapshot(capturePreflightSnapshot(before), after);
    expect(delta?.introduced.some(item =>
      item.code === 'bidi-control' && item.severity === 'blocker')).toBe(true);
  });

  it('does not capture stdin, output or full source in snapshot metadata', () => {
    const baseline = capturePreflightSnapshot(report(workspace(
      'print("PRIVATE_SOURCE_LITERAL");\n',
    )));
    expect(JSON.stringify(baseline)).not.toContain('PRIVATE_SOURCE_LITERAL');
    expect(JSON.stringify(baseline)).not.toContain('stdin');
    expect(JSON.stringify(baseline)).not.toContain('stdout');
  });

  it('returns null when the current graph is incomplete and comparison is unsafe', () => {
    const baseline = capturePreflightSnapshot(initial);
    const incomplete = report(workspace('import "\\u{61}.srp" as a;'));
    expect(comparePreflightSnapshot(baseline, incomplete)).toBeNull();
  });

  it('rejects malformed user-provided baseline envelopes', () => {
    expect(comparePreflightSnapshot(null, initial)).toBeNull();
    expect(comparePreflightSnapshot({
      sourceCount: 1, entry: 'main.srp',
      issues: Array.from({ length: MAX_PREFLIGHT_ISSUES + 1 },
        () => ({ id: 'unknown' } as unknown as PreflightIssue)),
    }, initial)).toBeNull();
  });

  it('keeps source snapshots and reports unchanged after comparison', () => {
    const baseline = capturePreflightSnapshot(initial)!;
    const before = JSON.stringify(baseline);
    comparePreflightSnapshot(baseline, report(workspace('print(1);\n')));
    expect(JSON.stringify(baseline)).toBe(before);
  });

  it('limits delta display size without expanding the metadata snapshots', () => {
    expect(MAX_PREFLIGHT_DELTA).toBeLessThan(MAX_PREFLIGHT_ISSUES);
    const clean = report(workspace('print(1);\n'));
    const snapshot = capturePreflightSnapshot(clean)!;
    const compared = comparePreflightSnapshot(snapshot, clean)!;
    expect(compared.truncated).toBe(false);
  });
});
