import { MAX_FILES, validPath, validateWorkspace, type Workspace } from './workspace';

export const MAX_EXPLORER_FILTER = 128;
export const NEW_MODULE_SOURCE = '// New Scarp module\n';

export type SourceTreeFile = {
  kind: 'file';
  name: string;
  path: string;
  bytes: number;
  entry: boolean;
};

export type SourceTreeFolder = {
  kind: 'folder';
  name: string;
  path: string;
  children: SourceTreeNode[];
  fileCount: number;
  bytes: number;
};

export type SourceTreeNode = SourceTreeFile | SourceTreeFolder;

export type SourceTree = {
  nodes: SourceTreeNode[];
  matched: number;
  total: number;
  totalBytes: number;
  error: string | null;
};

type MutableFolder = {
  name: string;
  path: string;
  folders: Map<string, MutableFolder>;
  files: SourceTreeFile[];
  fileCount: number;
  bytes: number;
};

function folder(name: string, path: string): MutableFolder {
  return { name, path, folders: new Map(), files: [], fileCount: 0, bytes: 0 };
}

function order<T extends { name: string }>(left: T, right: T): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

function freezeTree(node: MutableFolder): SourceTreeFolder {
  return {
    kind: 'folder', name: node.name, path: node.path,
    children: [
      ...[...node.folders.values()].sort(order).map(freezeTree),
      ...node.files.sort(order),
    ],
    fileCount: node.fileCount, bytes: node.bytes,
  };
}

/**
 * Build a stable, folder-first view of the bounded virtual workspace.
 * No filesystem access, source execution, regex searches or mutation.
 * Filtering matches literal full paths; hidden nodes contribute only to
 * aggregate workspace totals, not filtered folder counts.
 */
export function buildSourceTree(workspace: Workspace, query = ''): SourceTree {
  const error = validateWorkspace(workspace);
  if (error) return { nodes: [], matched: 0, total: 0, totalBytes: 0, error };
  const root = folder('', '');
  const encoder = new TextEncoder();
  const needle = query.slice(0, MAX_EXPLORER_FILTER).trim().toLowerCase();
  let matched = 0;
  let totalBytes = 0;
  const paths = Object.keys(workspace.files);
  for (const path of paths) {
    const bytes = encoder.encode(workspace.files[path]).byteLength;
    totalBytes += bytes;
    if (needle && !path.toLowerCase().includes(needle)) continue;
    matched++;
    root.fileCount++;
    root.bytes += bytes;
    const parts = path.split('/');
    const name = parts.pop()!;
    let current = root;
    for (const segment of parts) {
      let next = current.folders.get(segment);
      if (!next) {
        next = folder(segment, current.path ? current.path + '/' + segment : segment);
        current.folders.set(segment, next);
      }
      next.fileCount++;
      next.bytes += bytes;
      current = next;
    }
    current.files.push({ kind: 'file', name, path, bytes, entry: path === workspace.entry });
  }
  return { nodes: freezeTree(root).children, matched, total: paths.length, totalBytes, error: null };
}

/** True only for a descendant path, not a same-prefix sibling directory. */
export function folderContains(folderPath: string, filePath: string): boolean {
  return folderPath.length > 0 && filePath.startsWith(folderPath + '/');
}

export type NewSourcePlan =
  | { ok: true; path: string; workspace: Workspace }
  | { ok: false; error: string };

/** Validate a complete immutable snapshot before adding a new virtual source. */
export function previewNewSource(workspace: Workspace, path: string): NewSourcePlan {
  const invalid = validateWorkspace(workspace);
  if (invalid) return { ok: false, error: invalid };
  if (!validPath(path)) {
    return { ok: false, error: 'Choose a safe relative .srp path of at most 128 characters.' };
  }
  if (Object.hasOwn(workspace.files, path)) {
    return { ok: false, error: 'The source file already exists. Choose a different path.' };
  }
  if (Object.keys(workspace.files).length >= MAX_FILES) {
    return { ok: false, error: 'A workspace supports at most ' + MAX_FILES + ' .srp files.' };
  }
  const files = Object.assign(Object.create(null), workspace.files, { [path]: NEW_MODULE_SOURCE }) as Record<string, string>;
  const next = { entry: workspace.entry, files };
  const problem = validateWorkspace(next);
  return problem ? { ok: false, error: problem } : { ok: true, path, workspace: next };
}
