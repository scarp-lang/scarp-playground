import { previewPathMoves, type ModuleMoveLine } from './module-move';
import { validPath, validateWorkspace, type Workspace } from './workspace';

export type FolderPathMove = { from: string; to: string };
export type FolderMovePlan =
  | { ok: true; from: string; to: string; workspace: Workspace; paths: FolderPathMove[];
      rewrittenImports: number; changedFiles: string[]; lines: ModuleMoveLine[] }
  | { ok: false; error: string };

export function validFolderPath(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && validPath(path + '/a.srp');
}

/** Virtual folders are inferred from source paths, not host directories. */
export function workspaceFolders(workspace: Workspace): string[] {
  if (validateWorkspace(workspace)) return [];
  const folders = new Set<string>();
  for (const path of Object.keys(workspace.files)) {
    const segments = path.split('/');
    segments.pop();
    let prefix = '';
    for (const segment of segments) {
      prefix += (prefix ? '/' : '') + segment;
      folders.add(prefix);
    }
  }
  return [...folders].sort();
}

/** Relocate every descendant simultaneously, without merging into an occupied folder. */
export function previewFolderMove(workspace: Workspace, from: string, to: string): FolderMovePlan {
  const invalid = validateWorkspace(workspace);
  if (invalid) return { ok: false, error: invalid };
  if (!validFolderPath(from) || !validFolderPath(to)) {
    return { ok: false, error: 'Choose safe, nonempty relative folder paths.' };
  }
  if (from === to || to.startsWith(from + '/') || from.startsWith(to + '/')) {
    return { ok: false, error: 'Choose a different folder outside the original folder and its ancestors.' };
  }
  const original = Object.keys(workspace.files).sort();
  const descendants = original.filter(path => path.startsWith(from + '/'));
  if (!descendants.length) return { ok: false, error: 'The selected folder has no source files.' };
  if (original.some(path => path.startsWith(to + '/'))) {
    return { ok: false, error: 'The destination folder already contains source files. Choose an unused folder.' };
  }
  const paths = descendants.map(path => ({ from: path, to: to + path.slice(from.length) }));
  if (paths.some(path => !validPath(path.to))) {
    return { ok: false, error: 'A relocated source path would exceed the path limit.' };
  }
  const result = previewPathMoves(workspace, new Map(paths.map(path => [path.from, path.to])), true);
  return result.ok ? { ...result, from, to, paths } : result;
}
