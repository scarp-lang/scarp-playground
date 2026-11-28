import { describe, expect, it } from 'vitest';
import {
  MAX_IMPACT_DEPTH, MAX_IMPACT_PATHS,
  analyzeModuleImpact, explainModuleImpact, selectImpactExplanation,
  formatModuleImpactReport,
} from '../src/module-impact';
import { inspectModuleGraph } from '../src/module-graph';
import type { Workspace } from '../src/workspace';

const workspace: Workspace = {
  entry: 'main.srp',
  files: {
    'main.srp': 'import "lib/a.srp" as a;\nimport "lib/b.srp" as b;',
    'lib/a.srp': 'import "core.srp" as core;',
    'lib/b.srp': 'import "core.srp" as core;',
    'lib/core.srp': 'pub bind answer = 42;',
    'island.srp': 'print("separate");',
  },
};
const analyze = (changed: string, input = workspace) => analyzeModuleImpact(input, changed);
const successful = (changed: string, input = workspace) => {
  const result = analyze(changed, input);
  if (!result.ok) throw new Error(result.error);
  return result.report;
};

describe('bounded local module change-impact analysis', () => {
  it('identifies a changed dependency and all its indirect importers', () => {
    const result = successful('lib/core.srp');
    expect(result.entry).toBe('main.srp');
    expect(result.selected).toBe('lib/core.srp');
    expect(result.affected.map(item => [item.path, item.distance])).toEqual([
      ['lib/core.srp', 0], ['lib/a.srp', 1], ['lib/b.srp', 1], ['main.srp', 2],
    ]);
    expect(result.potentiallyUnaffected).toEqual(['island.srp']);
    expect(result.canCertifyUnaffected).toBe(true);
  });

  it('records shortest explanatory import chains', () => {
    const result = successful('lib/core.srp');
    expect(selectImpactExplanation(result, 'main.srp')).toEqual([
      'main.srp', 'lib/a.srp', 'lib/core.srp',
    ]);
    expect(selectImpactExplanation(result, 'lib/a.srp')).toEqual([
      'lib/a.srp', 'lib/core.srp',
    ]);
    expect(selectImpactExplanation(result, 'island.srp')).toBeNull();
    expect(explainModuleImpact(inspectModuleGraph(workspace), 'lib/core.srp', 'main.srp'))
      .toEqual(['main.srp', 'lib/a.srp', 'lib/core.srp']);
  });

  it('marks the entrypoint potentially affected by changes to its dependency', () => {
    const result = successful('lib/a.srp');
    expect(result.affected.map(item => item.path)).toEqual([
      'lib/a.srp', 'main.srp',
    ]);
    expect(result.affected[1]).toMatchObject({
      path: 'main.srp', direct: true, isEntry: true, distance: 1,
    });
  });

  it('does not claim consumers of the entrypoint are affected by its own changes', () => {
    const result = successful('main.srp');
    expect(result.affected).toEqual([{
      path: 'main.srp', distance: 0, route: ['main.srp'],
      direct: false, isEntry: true, changed: true,
    }]);
    expect(result.potentiallyUnaffected).toEqual([
      'island.srp', 'lib/a.srp', 'lib/b.srp', 'lib/core.srp',
    ]);
  });

  it('tracks disconnected imports in the same virtual workspace', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'print(1);',
      'isolated.srp': 'import "leaf.srp" as leaf;',
      'leaf.srp': '',
    } };
    const result = successful('leaf.srp', input);
    expect(result.affected.map(item => item.path)).toEqual(['leaf.srp', 'isolated.srp']);
    expect(result.potentiallyUnaffected).toEqual(['main.srp']);
    expect(result.affected.every(item => !item.isEntry)).toBe(true);
  });

  it('orders strong dependency components ahead of importers', () => {
    const result = successful('lib/core.srp');
    const order = result.buildOrder.map(index => result.components[index].members);
    const locate = (name: string) => order.findIndex(group => group.includes(name));
    expect(locate('lib/core.srp')).toBeLessThan(locate('lib/a.srp'));
    expect(locate('lib/core.srp')).toBeLessThan(locate('lib/b.srp'));
    expect(locate('lib/a.srp')).toBeLessThan(locate('main.srp'));
    expect(locate('lib/b.srp')).toBeLessThan(locate('main.srp'));
    expect(result.components).toHaveLength(5);
  });

  it('collapses a directed cycle into one atomic dependency stage', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'import "a.srp" as a;',
      'a.srp': 'import "b.srp" as b;',
      'b.srp': 'import "a.srp" as a;',
      'leaf.srp': 'print(0);',
    } };
    const result = successful('b.srp', input);
    const cycle = result.components.find(component => component.cyclic)!;
    expect(cycle.members).toEqual(['a.srp', 'b.srp']);
    expect(cycle.dependencies).toEqual([]);
    expect(result.affected.map(item => item.path)).toEqual([
      'b.srp', 'a.srp', 'main.srp',
    ]);
    const order = result.buildOrder;
    expect(order.indexOf(cycle.id)).toBeLessThan(order.indexOf(
      result.components.find(component => component.members.includes('main.srp'))!.id,
    ));
  });

  it('detects self-import cycles independently of inter-file cycles', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'import "main.srp" as self;',
      'other.srp': '',
    } };
    const result = successful('main.srp', input);
    expect(result.components.find(component => component.members.includes('main.srp'))?.cyclic)
      .toBe(true);
    expect(result.components.find(component => component.members.includes('other.srp'))?.cyclic)
      .toBe(false);
  });

  it('does not duplicate affected modules through several dependency routes', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'import "a.srp" as a;\nimport "b.srp" as b;',
      'a.srp': 'import "common.srp" as common;',
      'b.srp': 'import "common.srp" as common;',
      'common.srp': '',
    } };
    const result = successful('common.srp', input);
    expect(result.affected).toHaveLength(4);
    expect(result.affected.filter(item => item.path === 'main.srp')).toHaveLength(1);
    expect(result.affected.find(item => item.path === 'main.srp')?.distance).toBe(2);
  });

  it('distinguishes missing imports from unsupported spellings', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'import "missing.srp" as lost;\nimport "\\u{61}.srp" as strange;',
      'other.srp': '',
    } };
    const result = successful('other.srp', input);
    expect(result.canCertifyUnaffected).toBe(false);
    expect(result.missingImports).toHaveLength(1);
    expect(result.unsupportedImports).toHaveLength(1);
    expect(result.issues.join(' ')).toMatch(/Missing imported files/);
    expect(result.issues.join(' ')).toMatch(/Partial lexical scan/);
  });

  it('does not certify unaffected files when import strings are malformed', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': '"""unterminated',
      'other.srp': '',
    } };
    const result = successful('other.srp', input);
    expect(result.graphComplete).toBe(false);
    expect(result.canCertifyUnaffected).toBe(false);
    expect(result.issues.some(msg => msg.includes('Cannot inspect'))).toBe(true);
  });

  it('does not confuse import-looking text inside a string or comments', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'bind fake = """\nimport "other.srp" as other;\n""";\n// import "other.srp" as other;',
      'other.srp': '',
    } };
    const result = successful('other.srp', input);
    expect(result.affected.map(item => item.path)).toEqual(['other.srp']);
    expect(result.canCertifyUnaffected).toBe(true);
  });

  it('handles an empty source and a single-file workspace', () => {
    const input = { entry: 'main.srp', files: { 'main.srp': '' } };
    const result = successful('main.srp', input);
    expect(result.affected).toHaveLength(1);
    expect(result.components).toHaveLength(1);
    expect(result.buildOrder).toEqual([0]);
    expect(result.potentiallyUnaffected).toEqual([]);
    expect(result.scannedImports).toBe(0);
  });

  it('rejects absent source filenames without running any compiler worker', () => {
    const result = analyze('not-here.srp');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('existing source');
  });

  it('rejects malformed virtual workspaces, avoiding unexpected source coercion', () => {
    const invalid = { entry: 'missing.srp', files: { 'main.srp': '' } };
    expect(analyze('main.srp', invalid).ok).toBe(false);
    const fake = { entry: 'main.srp', files: { 'main.srp': 42 } };
    expect(analyze('main.srp', fake as unknown as Workspace).ok).toBe(false);
  });

  it('never mutates the input graph or source workspace', () => {
    const before = JSON.stringify(workspace);
    const graph = inspectModuleGraph(workspace);
    const graphBefore = JSON.stringify(graph);
    const result = analyze('lib/a.srp');
    expect(result.ok).toBe(true);
    const path = explainModuleImpact(graph, 'lib/a.srp', 'main.srp');
    expect(path).toEqual(['main.srp', 'lib/a.srp']);
    expect(JSON.stringify(graph)).toBe(graphBefore);
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it('shortest route favors fewer hops over lexically earlier detours', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'import "a.srp" as a;\nimport "target.srp" as direct;',
      'a.srp': 'import "target.srp" as t;',
      'target.srp': '',
    } };
    const route = explainModuleImpact(inspectModuleGraph(input), 'target.srp', 'main.srp');
    expect(route).toEqual(['main.srp', 'target.srp']);
    const report = successful('target.srp', input);
    expect(report.affected.find(item => item.path === 'main.srp')?.distance).toBe(1);
  });

  it('does not invent an impact explanation for nonexistent nodes', () => {
    const graph = inspectModuleGraph(workspace);
    expect(explainModuleImpact(graph, 'missing.srp', 'main.srp')).toBeNull();
    expect(explainModuleImpact(graph, 'lib/a.srp', 'missing.srp')).toBeNull();
  });

  it('caps import chain traversal at the actual workspace size', () => {
    expect(MAX_IMPACT_DEPTH).toBeGreaterThanOrEqual(MAX_IMPACT_PATHS);
    expect(workspace && Object.keys(workspace.files).length).toBeLessThanOrEqual(MAX_IMPACT_PATHS);
    const graph = inspectModuleGraph(workspace);
    expect(explainModuleImpact(graph, 'island.srp', 'main.srp')).toBeNull();
  });

  it('includes source-free explanations and explicit uncertainty in exports', () => {
    const result = successful('lib/core.srp');
    const text = formatModuleImpactReport(result);
    expect(text).toContain('Changed source: lib/core.srp');
    expect(text).toContain('main.srp → lib/a.srp → lib/core.srp');
    expect(text).toContain('Not affected by scanned imports:');
    expect(text).not.toContain('pub bind answer');
    expect(text).not.toContain('print("separate")');
  });

  it('exports partial scans with caveats and never labels unvisited modules safe', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'import "missing.srp" as missing;',
      'other.srp': 'bind secret = "TOP SECRET";',
    } };
    const result = successful('main.srp', input);
    const text = formatModuleImpactReport(result);
    expect(text).toContain('Not found in scanned paths (uncertain):');
    expect(text).toContain('Missing imported files');
    expect(text).not.toContain('TOP SECRET');
  });

  it('generates deterministic component stages independent of object insertion order', () => {
    const reverse: Workspace = { entry: workspace.entry,
      files: Object.fromEntries(Object.entries(workspace.files).reverse()) };
    const first = successful('lib/core.srp', workspace);
    const second = successful('lib/core.srp', reverse);
    expect(second.affected).toEqual(first.affected);
    expect(second.components).toEqual(first.components);
    expect(second.buildOrder).toEqual(first.buildOrder);
  });

  it('returns bounded output even when source import statements repeat many times', () => {
    const source = 'import "a.srp" as a;\n'.repeat(121);
    const input = { entry: 'main.srp', files: { 'main.srp': source, 'a.srp': '' } };
    const result = successful('a.srp', input);
    expect(result.scannedImports).toBe(120);
    expect(result.canCertifyUnaffected).toBe(false);
    expect(result.affected.map(item => item.path)).toEqual(['a.srp', 'main.srp']);
  });
});
