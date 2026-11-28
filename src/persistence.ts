import { validateWorkspace, type Workspace } from './workspace';
import { MAX_PORTABLE_WORKSPACE_BYTES } from './portable-workspace';
import { isUtf8Text } from './utf8';

// Versioned, opt-in browser-only saving. Never store via network requests.
// Limits apply when loading as well as saving; malformed data is never trusted.
export const LOCAL_WORKSPACE_KEY = 'scarp-playground-workspace-v1';
export const MAX_LOCAL_SNAPSHOT_BYTES = MAX_PORTABLE_WORKSPACE_BYTES;

export type SavedLocalWorkspace = { workspace: Workspace; activeFile: string };
type StorageAdapter = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseLocalWorkspace(raw: string | null): SavedLocalWorkspace | null {
  if (!raw || !isUtf8Text(raw, MAX_LOCAL_SNAPSHOT_BYTES)) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!record(data) || data.version !== 1 || !record(data.workspace)) return null;
    const entry = data.workspace.entry;
    const sourceFiles = data.workspace.files;
    if (typeof entry !== 'string' || !record(sourceFiles)) return null;
    const files: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [path, source] of Object.entries(sourceFiles)) {
      if (typeof source !== 'string') return null;
      files[path] = source;
    }
    const workspace: Workspace = { entry, files };
    if (validateWorkspace(workspace)) return null;
    const activeFile = typeof data.activeFile === 'string' && Object.hasOwn(files, data.activeFile)
      ? data.activeFile
      : entry;
    return { workspace, activeFile };
  } catch {
    return null;
  }
}

export function restoreLocalWorkspace(storage: StorageAdapter): SavedLocalWorkspace | null {
  try {
    return parseLocalWorkspace(storage.getItem(LOCAL_WORKSPACE_KEY));
  } catch {
    return null;
  }
}

export function saveLocalWorkspace(
  storage: StorageAdapter,
  workspace: Workspace,
  activeFile: string,
): string | null {
  const error = validateWorkspace(workspace);
  if (error) return error;
  const target = Object.hasOwn(workspace.files, activeFile) ? activeFile : workspace.entry;
  // Only the validated source map and entrypoint may enter browser storage.
  // Extra metadata on caller objects, including stdin, is never serialized.
  const serialized = JSON.stringify({ version: 1, workspace: {
    entry: workspace.entry, files: Object.fromEntries(Object.entries(workspace.files)),
  }, activeFile: target });
  if (new TextEncoder().encode(serialized).byteLength > MAX_LOCAL_SNAPSHOT_BYTES) {
    return 'The workspace is too large to save locally.';
  }
  try {
    storage.setItem(LOCAL_WORKSPACE_KEY, serialized);
    return null;
  } catch {
    return 'Browser storage is unavailable or full.';
  }
}

export function forgetLocalWorkspace(storage: StorageAdapter): boolean {
  try {
    storage.removeItem(LOCAL_WORKSPACE_KEY);
    return true;
  } catch {
    return false;
  }
}
