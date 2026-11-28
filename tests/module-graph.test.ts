import { describe, expect, it } from 'vitest';
import { inspectModuleGraph, MAX_GRAPH_IMPORTS } from '../src/module-graph';

describe('local module dependency overview', () => {
  it('reports sorted nodes, exact sites, reverse references and transitive reachability', () => {
    const workspace = { entry: 'main.srp', files: {
      'unused.srp': '',
      'main.srp': 'import "lib/a.srp" as a;\r\n// café 😀\r\nimport r"lib/b.srp" as b;',
      'lib/b.srp': 'import """a.srp""" as a;',
      'lib/a.srp': '',
    } };
    const before = JSON.stringify(workspace);
    const graph = inspectModuleGraph(workspace);
    expect(graph.complete).toBe(true);
    expect(graph.nodes.map(node => node.path)).toEqual(['lib/a.srp', 'lib/b.srp', 'main.srp', 'unused.srp']);
    const main = graph.nodes.find(node => node.path === 'main.srp')!;
    expect(main.outgoing).toEqual([
      { importer: 'main.srp', target: 'lib/a.srp', specifier: 'lib/a.srp', line: 1, column: 9, status: 'resolved' },
      { importer: 'main.srp', target: 'lib/b.srp', specifier: 'lib/b.srp', line: 3, column: 10, status: 'resolved' },
    ]);
    expect(graph.nodes[0].incoming).toHaveLength(2);
    expect(graph.nodes.filter(node => node.reached).map(node => node.path)).toEqual(['lib/a.srp', 'lib/b.srp', 'main.srp']);
    expect(graph.totalBytes).toBe(Object.values(workspace.files).reduce((sum, source) => sum + new TextEncoder().encode(source).byteLength, 0));
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it('recognizes self cycles, reachable mutual cycles and disconnected cycles independently', () => {
    const graph = inspectModuleGraph({ entry: 'main.srp', files: {
      'main.srp': 'import "a.srp" as a;',
      'a.srp': 'import "b.srp" as b;',
      'b.srp': 'import "a.srp" as a;',
      'self.srp': 'import "self.srp" as self;',
      'x.srp': 'import "y.srp" as y;',
      'y.srp': 'import "x.srp" as x;',
    } });
    expect(graph.nodes.filter(node => node.cycle).map(node => node.path)).toEqual(['a.srp', 'b.srp', 'self.srp', 'x.srp', 'y.srp']);
    expect(graph.nodes.filter(node => node.reached).map(node => node.path)).toEqual(['a.srp', 'b.srp', 'main.srp']);
  });

  it('reports missing and unsupported paths separately without guessing', () => {
    const graph = inspectModuleGraph({ entry: 'main.srp', files: {
      'main.srp': 'import "absent.srp" as absent;\nimport "\\u{61}.srp" as a;',
      'a.srp': '',
    } });
    expect(graph.complete).toBe(false);
    expect(graph.nodes[1].outgoing.map(edge => [edge.status, edge.target])).toEqual([
      ['missing', 'absent.srp'], ['invalid', null],
    ]);
    expect(graph.nodes[0].reached).toBe(false);
  });

  it('ignores verbatim string content and comments, preserves UTF-16 columns', () => {
    const graph = inspectModuleGraph({ entry: 'main.srp', files: {
      'main.srp': 'bind s = """\nimport "missing.srp" as fake;\n""";\r\nprint("😀"); import "lib.srp" as lib;',
      'lib.srp': '',
    } });
    const edges = graph.nodes.find(node => node.path === 'main.srp')!.outgoing;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ target: 'lib.srp', line: 4, column: 22 });
  });

  it('marks malformed and capped scans partial instead of certifying unused files', () => {
    const malformed = inspectModuleGraph({ entry: 'main.srp', files: { 'main.srp': '"""unterminated', 'a.srp': '' } });
    expect(malformed.complete).toBe(false);
    expect(malformed.issues).toContain('Cannot inspect import syntax in main.srp.');
    const capped = inspectModuleGraph({ entry: 'main.srp', files: {
      'main.srp': 'import "a.srp" as a;\n'.repeat(MAX_GRAPH_IMPORTS + 1),
      'a.srp': '',
    } });
    expect(capped.scannedImports).toBe(MAX_GRAPH_IMPORTS);
    expect(capped.complete).toBe(false);
    expect(capped.issues[0]).toContain('120');
  });

  it('admits exactly the display quota without a false truncation claim', () => {
    const graph = inspectModuleGraph({ entry: 'main.srp', files: {
      'main.srp': 'import "a.srp" as a;\n'.repeat(MAX_GRAPH_IMPORTS),
      'a.srp': '',
    } });
    expect(graph.complete).toBe(true);
    expect(graph.scannedImports).toBe(MAX_GRAPH_IMPORTS);
  });

  it('rejects invalid source workspaces and returns an empty bounded result', () => {
    const graph = inspectModuleGraph({ entry: 'missing.srp', files: { 'a.srp': '' } });
    expect(graph.nodes).toEqual([]);
    expect(graph.complete).toBe(false);
    expect(graph.issues).toHaveLength(1);
  });
});
