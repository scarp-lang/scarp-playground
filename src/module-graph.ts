import { importPaths, resolveVirtualImport } from './module-move';
import { validateWorkspace, type Workspace } from './workspace';

// Independent display quota, not a compiler import or execution limit.
export const MAX_GRAPH_IMPORTS = 120;

export type ModuleImport = {
  importer: string;
  target: string | null;
  specifier: string;
  line: number;
  column: number;
  status: 'resolved' | 'missing' | 'invalid';
};

export type ModuleGraphNode = {
  path: string;
  bytes: number;
  outgoing: ModuleImport[];
  incoming: ModuleImport[];
  reached: boolean;
  cycle: boolean;
};

export type ModuleGraph = {
  entry: string;
  nodes: ModuleGraphNode[];
  complete: boolean;
  issues: string[];
  scannedImports: number;
  totalBytes: number;
};

function coordinates(source: string, offset: number): { line: number; column: number } {
  // Monaco offsets are UTF-16 code units. A CRLF is one line break.
  let line = 1;
  let start = 0;
  for (let cursor = 0; cursor < offset; cursor++) {
    if (source[cursor] === '\r') {
      if (source[cursor + 1] === '\n' && cursor + 1 < offset) cursor++;
      line++;
      start = cursor + 1;
    } else if (source[cursor] === '\n') {
      line++;
      start = cursor + 1;
    }
  }
  return { line, column: offset - start + 1 };
}

/**
 * Local lexical import overview of the current snapshot. This does not run
 * code, call the compiler, or certify that a module is unused. Uninspected
 * sources and truncated scans make negative reachability claims unavailable.
 */
export function inspectModuleGraph(workspace: Workspace): ModuleGraph {
  const failure = validateWorkspace(workspace);
  if (failure) {
    return { entry: '', nodes: [], complete: false, issues: [failure], scannedImports: 0, totalBytes: 0 };
  }

  const encoder = new TextEncoder();
  const paths = Object.keys(workspace.files).sort();
  const byPath = new Map<string, ModuleGraphNode>();
  const issues: string[] = [];
  let totalBytes = 0;
  let scannedImports = 0;
  let complete = true;
  let truncated = false;
  for (const path of paths) {
    const bytes = encoder.encode(workspace.files[path]).byteLength;
    totalBytes += bytes;
    byPath.set(path, { path, bytes, outgoing: [], incoming: [], reached: false, cycle: false });
  }

  for (const path of paths) {
    if (truncated) break;
    const source = workspace.files[path];
    const sites = importPaths(source);
    if (!sites) {
      complete = false;
      issues.push('Cannot inspect import syntax in ' + path + '.');
      continue;
    }
    const node = byPath.get(path)!;
    for (const site of sites) {
      if (scannedImports === MAX_GRAPH_IMPORTS) {
        truncated = true;
        complete = false;
        issues.push('Only the first ' + MAX_GRAPH_IMPORTS + ' import statements are shown.');
        break;
      }
      scannedImports++;
      const target = resolveVirtualImport(path, site.specifier);
      const destination = target === null ? undefined : byPath.get(target);
      const status = target === null ? 'invalid' : destination ? 'resolved' : 'missing';
      const edge: ModuleImport = {
        importer: path, target, specifier: site.specifier.slice(0, 128),
        ...coordinates(source, site.start), status,
      };
      node.outgoing.push(edge);
      if (destination) destination.incoming.push(edge);
      if (status === 'invalid') {
        // An unsupported spelling can still be a valid compiler-decoded path.
        // Never classify an unvisited file as unused under this uncertainty.
        complete = false;
      }
    }
  }

  function reachableFrom(path: string): Set<string> {
    const visited = new Set<string>();
    const pending: string[] = [path];
    while (pending.length) {
      const next = pending.pop()!;
      if (visited.has(next)) continue;
      visited.add(next);
      for (const edge of byPath.get(next)?.outgoing ?? []) {
        if (edge.status === 'resolved' && edge.target !== null && !visited.has(edge.target)) {
          pending.push(edge.target);
        }
      }
    }
    return visited;
  }

  const reached = reachableFrom(workspace.entry);
  const nodes = paths.map(path => byPath.get(path)!);
  for (const node of nodes) {
    node.reached = reached.has(node.path);
    // A path belongs to a directed cycle iff one of its direct dependencies
    // has a path back to it. With at most 12 nodes, this bounded approach
    // avoids recursive traversal and reports disconnected cycles too.
    node.cycle = node.outgoing.some(edge => edge.status === 'resolved' &&
      edge.target !== null && reachableFrom(edge.target).has(node.path));
  }
  return { entry: workspace.entry, nodes, complete, issues, scannedImports, totalBytes };
}
