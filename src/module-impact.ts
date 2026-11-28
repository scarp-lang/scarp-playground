import { inspectModuleGraph, type ModuleGraph, type ModuleImport } from './module-graph';
import { validateWorkspace, type Workspace } from './workspace';

export const MAX_IMPACT_PATHS = 12;
export const MAX_IMPACT_DEPTH = 12;

export type ModuleComponent = Readonly<{
  id: number;
  members: string[];
  cyclic: boolean;
  dependencies: number[];
  dependents: number[];
  reachableFromEntry: boolean;
}>;

export type AffectedModule = Readonly<{
  path: string;
  distance: number;
  route: string[];
  direct: boolean;
  isEntry: boolean;
  changed: boolean;
}>;

export type ModuleImpactReport = Readonly<{
  entry: string;
  selected: string;
  graphComplete: boolean;
  canCertifyUnaffected: boolean;
  affected: AffectedModule[];
  potentiallyUnaffected: string[];
  missingImports: ModuleImport[];
  unsupportedImports: ModuleImport[];
  components: ModuleComponent[];
  buildOrder: number[];
  issues: string[];
  scannedImports: number;
  totalBytes: number;
}>;

export type ModuleImpactResult =
  | { ok: true; report: ModuleImpactReport }
  | { ok: false; error: string };

const error = (message: string): ModuleImpactResult => ({ ok: false, error: message });
const sorted = (items: Iterable<string>): string[] => [...items].sort((a, b) => a.localeCompare(b, 'en'));

function dependencyMap(graph: ModuleGraph): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const edges = node.outgoing
      .filter(edge => edge.status === 'resolved' && edge.target !== null)
      .map(edge => edge.target!);
    map.set(node.path, sorted(new Set(edges)));
  }
  return map;
}

function reverseMap(graph: ModuleGraph): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const importers = node.incoming
      .filter(edge => edge.status === 'resolved')
      .map(edge => edge.importer);
    map.set(node.path, sorted(new Set(importers)));
  }
  return map;
}

/**
 * Strongly connected components in the *lexically scanned* local import graph.
 * At most 12 virtual files are accepted. This does not resolve runtime imports
 * or claim that the compiler accepted all dependencies.
 */
function componentsOf(graph: ModuleGraph): { components: ModuleComponent[]; order: number[] } {
  const paths = graph.nodes.map(node => node.path);
  const dependencies = dependencyMap(graph);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const stacked = new Set<string>();
  const groups: string[][] = [];
  let nextIndex = 0;

  function visit(path: string): void {
    const id = nextIndex++;
    index.set(path, id);
    low.set(path, id);
    stack.push(path);
    stacked.add(path);
    for (const dependency of dependencies.get(path) ?? []) {
      if (!index.has(dependency)) {
        visit(dependency);
        low.set(path, Math.min(low.get(path)!, low.get(dependency)!));
      } else if (stacked.has(dependency)) {
        low.set(path, Math.min(low.get(path)!, index.get(dependency)!));
      }
    }
    if (low.get(path) !== index.get(path)) return;
    const members: string[] = [];
    let current: string;
    do {
      current = stack.pop()!;
      stacked.delete(current);
      members.push(current);
    } while (current !== path);
    groups.push(sorted(members));
  }

  for (const path of paths) if (!index.has(path)) visit(path);
  groups.sort((a, b) => a[0].localeCompare(b[0], 'en'));
  const owner = new Map<string, number>();
  groups.forEach((members, group) => members.forEach(member => owner.set(member, group)));

  const components: ModuleComponent[] = groups.map((members, id) => {
    const imported = new Set<number>();
    const importers = new Set<number>();
    for (const path of members) {
      for (const next of dependencies.get(path) ?? []) {
        const target = owner.get(next)!;
        if (target !== id) imported.add(target);
      }
    }
    for (const [path, targets] of dependencies) {
      const dependentId = owner.get(path)!;
      if (dependentId !== id && targets.some(target => owner.get(target) === id)) {
        importers.add(dependentId);
      }
    }
    return {
      id,
      members,
      cyclic: members.length > 1 || dependencies.get(members[0])?.includes(members[0]) === true,
      dependencies: [...imported].sort((a, b) => a - b),
      dependents: [...importers].sort((a, b) => a - b),
      reachableFromEntry: members.some(path => graph.nodes.find(n => n.path === path)?.reached),
    };
  });

  // A topological *display order*: dependencies precede their importers.
  // A strongly-connected group is displayed as one atomic stage, never as
  // a fabricated order between its mutually dependent members.
  const remaining = new Map<number, number>();
  for (const component of components) {
    remaining.set(component.id, component.dependencies.length);
  }
  const ready = components.filter(c => remaining.get(c.id) === 0).map(c => c.id);
  const order: number[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => a - b);
    const current = ready.shift()!;
    order.push(current);
    for (const dependent of components[current].dependents) {
      const left = remaining.get(dependent)! - 1;
      remaining.set(dependent, left);
      if (left === 0) ready.push(dependent);
    }
  }
  return { components, order };
}

function affectedBy(graph: ModuleGraph, selected: string): AffectedModule[] {
  const backward = reverseMap(graph);
  const route = new Map<string, string[]>();
  route.set(selected, [selected]);
  const queue = [selected];

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const target = queue[cursor];
    const tail = route.get(target)!;
    if (tail.length > MAX_IMPACT_DEPTH) continue;
    for (const importer of backward.get(target) ?? []) {
      if (route.has(importer)) continue;
      const path = [importer, ...tail];
      route.set(importer, path);
      queue.push(importer);
    }
  }

  const result: AffectedModule[] = [];
  for (const [path, chain] of route) {
    result.push({
      path, distance: chain.length - 1, route: chain,
      direct: chain.length === 2,
      isEntry: path === graph.entry,
      changed: path === selected,
    });
  }
  return result.sort((a, b) => a.distance - b.distance || a.path.localeCompare(b.path, 'en'));
}

/** Enumerate bounded shortest import routes from *each* affected module. */
export function explainModuleImpact(
  graph: ModuleGraph, selected: string, dependent: string,
): string[] | null {
  if (!graph.nodes.some(node => node.path === selected) ||
      !graph.nodes.some(node => node.path === dependent)) return null;
  const map = dependencyMap(graph);
  const queue: string[][] = [[dependent]];
  const visited = new Set<string>([dependent]);
  while (queue.length > 0) {
    const chain = queue.shift()!;
    const current = chain.at(-1)!;
    if (current === selected) return chain;
    if (chain.length > MAX_IMPACT_DEPTH) continue;
    for (const path of map.get(current) ?? []) {
      if (!visited.has(path)) {
        visited.add(path);
        queue.push([...chain, path]);
      }
    }
  }
  return null;
}

/**
 * Assess the potential impact of editing one virtual .srp source, based only
 * on lexically resolved import statements. Negative claims are disabled if
 * any import could not be inspected.
 */
export function analyzeModuleImpact(workspace: Workspace, selected: string): ModuleImpactResult {
  const failure = validateWorkspace(workspace);
  if (failure) return error(failure);
  if (!Object.hasOwn(workspace.files, selected)) return error('Select an existing source module.');
  const graph = inspectModuleGraph(workspace);
  if (graph.nodes.length > MAX_IMPACT_PATHS) return error('Module impact exceeds the browser file limit.');
  const affected = affectedBy(graph, selected);
  const affectedPaths = new Set(affected.map(item => item.path));
  const potentiallyUnaffected = sorted(graph.nodes.map(node => node.path)
    .filter(path => !affectedPaths.has(path)));
  const unresolved = graph.nodes.flatMap(node => node.outgoing)
    .filter(edge => edge.status !== 'resolved');
  const missingImports = unresolved.filter(edge => edge.status === 'missing');
  const unsupportedImports = unresolved.filter(edge => edge.status === 'invalid');
  const { components, order } = componentsOf(graph);
  const issues = [...graph.issues];
  if (missingImports.length > 0) {
    issues.push('Missing imported files can hide additional dependency paths.');
  }
  if (unsupportedImports.length > 0) {
    issues.push('Unsupported import spellings prevent definitive reachability claims.');
  }
  if (!graph.complete) {
    issues.push('Partial lexical scan: the list is a lower bound, not a complete dependency audit.');
  }
  return { ok: true, report: {
    entry: graph.entry, selected, graphComplete: graph.complete,
    canCertifyUnaffected: graph.complete && unresolved.length === 0,
    affected, potentiallyUnaffected, missingImports, unsupportedImports,
    components, buildOrder: order, issues: [...new Set(issues)],
    scannedImports: graph.scannedImports, totalBytes: graph.totalBytes,
  } };
}

export function selectImpactExplanation(
  report: ModuleImpactReport, dependent: string,
): string[] | null {
  return report.affected.find(item => item.path === dependent)?.route ?? null;
}

/** Bounded text report. Never exports the file contents of an open workspace. */
export function formatModuleImpactReport(report: ModuleImpactReport): string {
  const lines = [
    'Scarp Playground — Local module impact report',
    'Changed source: ' + report.selected,
    'Entrypoint: ' + report.entry,
    'Scan: ' + (report.graphComplete ? 'complete for supported local imports' : 'partial'),
    'Affected via scanned imports: ' + report.affected.length,
    'Potentially unaffected: ' + report.potentiallyUnaffected.length,
    '',
    'Potential dependents:',
  ];
  for (const module of report.affected) {
    lines.push('- ' + module.path + ' (' +
      (module.changed ? 'selected' : module.distance + ' dependency hop(s)') + ')');
    if (!module.changed) lines.push('  via ' + module.route.join(' → '));
  }
  if (report.potentiallyUnaffected.length) {
    lines.push('', report.canCertifyUnaffected
      ? 'Not affected by scanned imports:' : 'Not found in scanned paths (uncertain):');
    for (const path of report.potentiallyUnaffected) lines.push('- ' + path);
  }
  if (report.issues.length) {
    lines.push('', 'Caveats:');
    for (const message of report.issues) lines.push('- ' + message);
  }
  return lines.join('\n') + '\n';
}
